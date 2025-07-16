<template>
    <div id="wrapper">
        <div id="toolbar">
            <table class="infoPanel">
                <select class="color-coding-select" v-model="selectedColorCoder" v-on:change="updateColor">
                    <option :key="key" :value="key" v-for="(value, key) in useableColorCoders">
                        {{ key }}
                    </option>
                </select>
                <tbody>
                    <tr v-bind:key="mode[0]" v-for="mode in colorCodeLegend">
                        <td class="mode" v-bind:style="{ color: mode.color }">{{ mode.name }}</td>
                    </tr>
                </tbody>
            </table>
            <OpenLayersSettingsWidget 
                @base-layer-changed="changeBaseLayer"
                @trajectory-visibility-changed="toggleTrajectoryVisibility"
                @waypoints-visibility-changed="toggleWaypointsVisibility"
                @vehicle-visibility-changed="toggleVehicleVisibility"
                @trajectory-style-changed="changeTrajectoryStyle" />
        </div>
        <div id="mapContainer" ref="mapContainer"></div>
        <div id="timelineContainer" ref="timelineContainer"></div>
    </div>
</template>

<script>
/* eslint-disable */
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import XYZ from 'ol/source/XYZ'
import { fromLonLat, toLonLat } from 'ol/proj'
import { Feature } from 'ol'
import { LineString, Point } from 'ol/geom'
import { Style, Stroke, Fill, Circle as CircleStyle, Icon, Text } from 'ol/style'
import { defaults as defaultControls, FullScreen, ZoomToExtent } from 'ol/control'

import { store } from './Globals.js'
import { IMAGERY_PROVIDERS, DEFAULT_CENTER, DEFAULT_ZOOM } from '../config/openlayers.js'
import OpenLayersSettingsWidget from './widgets/OpenLayersSettingsWidget.vue'
import { OpenLayersTimeline, TimelineWidget } from './openLayersExtra/timeline.js'
import ColorCoderMode from './openLayersExtra/colorCoderMode.js'
import ColorCoderRange from './openLayersExtra/colorCoderRange.js'
import ColorCoderPlot from './openLayersExtra/colorCoderPlot.js'

export default {
  name: 'OpenLayersViewer',

  data () {
    return {
      state: store,
      startTimeMs: 0,
      lastEmitted: 0,
      colorCoder: null,
      selectedColorCoder: 'Mode',
      map: null,
      trajectoryLayer: null,
      vehicleLayer: null,
      waypointsLayer: null,
      animationFrame: null,
      currentTimeIndex: 0,
      timeline: null,
      timelineWidget: null
    }
  },

  components: {
    OpenLayersSettingsWidget
  },

  created () {
    // Link time with plot updates
    this.$eventHub.$on('hoveredTime', this.showAttitude)
    this.state.mapLoading = true
  },

  beforeDestroy () {
    this.$eventHub.$off('hoveredTime')
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
    }
    if (this.timeline) {
      this.timeline.destroy()
    }
  },

  mounted () {
    this.initializeMap()
  },

  methods: {
    initializeMap () {
      // Create base map layers
      const baseLayer = new TileLayer({
        source: new OSM()
      })

      // Create vector layers for different data types
      this.trajectoryLayer = new VectorLayer({
        source: new VectorSource(),
        style: this.getTrajectoryStyle,
        zIndex: 1
      })

      this.vehicleLayer = new VectorLayer({
        source: new VectorSource(),
        style: this.getVehicleStyle,
        zIndex: 3
      })

      this.waypointsLayer = new VectorLayer({
        source: new VectorSource(),
        style: this.getWaypointStyle,
        zIndex: 2
      })

      // Initialize map
      this.map = new Map({
        target: this.$refs.mapContainer,
        layers: [
          baseLayer,
          this.trajectoryLayer,
          this.waypointsLayer,
          this.vehicleLayer
        ],
        view: new View({
          center: fromLonLat(DEFAULT_CENTER),
          zoom: DEFAULT_ZOOM
        }),
        controls: defaultControls().extend([
          new FullScreen(),
          new ZoomToExtent({
            extent: this.getDataExtent()
          })
        ])
      })

      // Add event handlers
      this.setupEventHandlers()

      // Initialize timeline
      this.initializeTimeline()

      // Load data if available
      if (this.state.currentTrajectory?.length > 0) {
        this.loadTrajectoryData()
      }

      this.state.mapLoading = false
    },

    setupEventHandlers () {
      // Click handler for time scrubbing
      this.map.on('click', (evt) => {
        const features = this.map.getFeaturesAtPixel(evt.pixel)
        if (features.length > 0) {
                    const feature = features[0]
                    const time = feature.get('time')
                    if (time !== undefined) {
                        this.$eventHub.$emit('map-time-changed', time)
                    }
                }
            })
            
            // Mouse move for hover effects
            this.map.on('pointermove', (evt) => {
                const features = this.map.getFeaturesAtPixel(evt.pixel)
                this.map.getTargetElement().style.cursor = features.length > 0 ? 'pointer' : ''
            })
        },
        
        loadTrajectoryData() {
            // Convert trajectory data to OpenLayers features
            const trajectoryFeatures = this.createTrajectoryFeatures()
            const vehicleFeature = this.createVehicleFeature()
            const waypointFeatures = this.createWaypointFeatures()
            
            // Add features to layers
            this.trajectoryLayer.getSource().addFeatures(trajectoryFeatures)
            this.vehicleLayer.getSource().addFeature(vehicleFeature)
            this.waypointsLayer.getSource().addFeatures(waypointFeatures)
            
            // Set up timeline with trajectory data
            this.setupTimelineData()
            
            // Fit map to data extent
            this.fitToData()
        },
        
        createTrajectoryFeatures() {
            const features = []
            const coordinates = this.state.currentTrajectory.map(point => 
                fromLonLat([point[0], point[1]])
            )
            
            // Create line string for full trajectory
            const lineFeature = new Feature({
                geometry: new LineString(coordinates),
                type: 'trajectory'
            })
            
            features.push(lineFeature)
            
            // Create point features for interactive time scrubbing
            this.state.currentTrajectory.forEach((point, index) => {
                const pointFeature = new Feature({
                    geometry: new Point(fromLonLat([point[0], point[1]])),
                    type: 'trajectory-point',
                    time: point[3], // time_boot_ms
                    index: index,
                    altitude: point[2]
                })
                features.push(pointFeature)
            })
            
            return features
        },
        
        getTrajectoryStyle () {
          return new Style({
            stroke: new Stroke({
              color: '#ff0000',
              width: 2
            })
          })
        },
        
        getVehicleStyle () {
          return new Style({
            image: new CircleStyle({
              radius: 8,
              fill: new Fill({ color: '#00ff00' }),
              stroke: new Stroke({ color: '#000000', width: 2 })
            })
          })
        },
        
        getWaypointStyle () {
          return new Style({
            image: new CircleStyle({
              radius: 5,
              fill: new Fill({ color: '#ffff00' }),
              stroke: new Stroke({ color: '#000000', width: 1 })
            })
          })
        },

        /**
         * Returns the extent [minX, minY, maxX, maxY] of the trajectory in EPSG:3857
         */
        getDataExtent () {
          if (!this.state.currentTrajectory || this.state.currentTrajectory.length === 0) {
            // Default to world extent if no data
            return [-20037508, -20037508, 20037508, 20037508]
          }
          let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90
          this.state.currentTrajectory.forEach(point => {
            const lon = point[0]
            const lat = point[1]
            if (lon < minLon) minLon = lon
            if (lon > maxLon) maxLon = lon
            if (lat < minLat) minLat = lat
            if (lat > maxLat) maxLat = lat
          })
          // Convert to EPSG:3857
          const minXY = fromLonLat([minLon, minLat])
          const maxXY = fromLonLat([maxLon, maxLat])
          return [minXY[0], minXY[1], maxXY[0], maxXY[1]]
        },

        createVehicleFeature() {
          if (!this.state.currentTrajectory || this.state.currentTrajectory.length === 0) {
            return new Feature({
              geometry: new Point(fromLonLat([0, 0])),
              type: 'vehicle'
            })
          }
          const firstPoint = this.state.currentTrajectory[0]
          return new Feature({
            geometry: new Point(fromLonLat([firstPoint[0], firstPoint[1]])),
            type: 'vehicle'
          })
        },
        
        createWaypointFeatures() {
          const features = []
          // Add waypoint creation logic here if needed
          return features
        },
        
        fitToData () {
          if (!this.map || !this.state.currentTrajectory || this.state.currentTrajectory.length === 0) {
            return
          }
          
          const extent = this.getDataExtent()
          this.map.getView().fit(extent, {
            padding: [20, 20, 20, 20],
            maxZoom: 16
          })
        },
        
        showAttitude (time) {
          // Update vehicle position and orientation based on time
          this.updateVehiclePosition(time)
        },
        
        updateVehiclePosition (time) {
          // Find closest trajectory point to the given time
          const trajectory = this.state.currentTrajectory
          if (!trajectory || trajectory.length === 0) return
          
          let closestIndex = 0
          let minTimeDiff = Math.abs(trajectory[0][3] - time)

          for (let i = 1; i < trajectory.length; i++) {
            const timeDiff = Math.abs(trajectory[i][3] - time)
            if (timeDiff < minTimeDiff) {
              minTimeDiff = timeDiff
              closestIndex = i
            }
          }

          const point = trajectory[closestIndex]
          const vehicleFeature = this.vehicleLayer.getSource().getFeatures()[0]
          if (vehicleFeature) {
            vehicleFeature.getGeometry().setCoordinates(fromLonLat([point[0], point[1]]))
          }
        },

        changeBaseLayer (layerName) {
          // Find the provider configuration
          const provider = IMAGERY_PROVIDERS.find(p => p.name === layerName)
          if (!provider) {
            console.warn('Base layer not found:', layerName)
            return
          }

          // Remove existing base layer
          const layers = this.map.getLayers()
          const baseLayer = layers.item(0) // Base layer is always first
          if (baseLayer) {
            layers.removeAt(0)
          }

          // Create new base layer
          let newBaseLayer
          if (provider.name === 'OpenStreetMap') {
            newBaseLayer = new TileLayer({
              source: new OSM()
            })
          } else {
            newBaseLayer = new TileLayer({
              source: new XYZ({
                url: provider.url,
                maxZoom: provider.maxZoom,
                attributions: provider.attribution
              })
            })
          }

          // Insert new base layer at the beginning
          layers.insertAt(0, newBaseLayer)
          console.log('Changed base layer to:', layerName)
        },

        toggleTrajectoryVisibility (visible) {
          if (this.trajectoryLayer) {
            this.trajectoryLayer.setVisible(visible)
          }
        },
        
        toggleWaypointsVisibility (visible) {
          if (this.waypointsLayer) {
            this.waypointsLayer.setVisible(visible)
          }
        },
        
        toggleVehicleVisibility (visible) {
          if (this.vehicleLayer) {
            this.vehicleLayer.setVisible(visible)
          }
        },
        
    changeTrajectoryStyle (style) {
      // Re-style trajectory based on selection
      this.updateTrajectoryStyles()
    },

    updateColor () {
      // Update color coding when selection changes
      this.updateColorCoding()
    },

    updateColorCoding () {
      // Update trajectory colors based on selected color coder
      const newCoder = this.availableColorCoders[this.selectedColorCoder]
      this.colorCoder = newCoder
      this.updateTrajectoryStyles()
    },

    updateTrajectoryStyles () {
      // Re-apply styles to trajectory features
      if (this.trajectoryLayer) {
        this.trajectoryLayer.changed()
      }
    },

    initializeTimeline () {
      // Create timeline instance
      this.timeline = new OpenLayersTimeline(this, {
        updateInterval: 50,
        autoLoop: false
      })

      // Create timeline widget
      this.timelineWidget = new TimelineWidget(this.$refs.timelineContainer, this.timeline)
    },

    setupTimelineData () {
      console.log('=== Timeline Data Setup ===')
      console.log('Timeline exists:', !!this.timeline)
      console.log('Current trajectory:', !!this.state.currentTrajectory)
      console.log('Messages available:', !!this.state.messages)
      
      if (this.state.messages) {
        console.log('Available message types:', Object.keys(this.state.messages))
      }
      
      if (!this.timeline || !this.state.currentTrajectory || this.state.currentTrajectory.length === 0) {
        console.log('Timeline setup skipped - missing required data')
        return
      }

      // Get time range from trajectory data
      const times = this.state.currentTrajectory.map(point => point[3]) // time_boot_ms
      const startTime = Math.min(...times)
      const endTime = Math.max(...times)

      console.log('Timeline setup - Start time:', startTime, 'End time:', endTime, 'Duration:', endTime - startTime)
      console.log('Trajectory points count:', this.state.currentTrajectory.length)
      console.log('First few trajectory points:', this.state.currentTrajectory.slice(0, 3))

      // Set timeline range
      this.timeline.setTimeRange(startTime, endTime)
      this.timeline.setCurrentTime(startTime)

      // Add color-coded background for flight modes
      this.setupTimelineColorCoding(startTime, endTime)
      
      // Refresh GPS display now that we have data
      if (this.timelineWidget) {
        this.timelineWidget.refreshGPSDisplay()
      }
    },

    setupTimelineColorCoding (startTime, endTime) {
      // Create mode segments for timeline coloring
      const modeSegments = this.createModeSegments(startTime, endTime)
      if (this.timelineWidget) {
        this.timelineWidget.setModeSegments(modeSegments)
      }
    },

    createModeSegments (startTime, endTime) {
      const segments = []
      
      if (!this.state.flightModeChanges || this.state.flightModeChanges.length === 0) {
        // No mode data available, show default segment
        return [{
          start: 0,
          end: 1,
          color: '#666',
          mode: 'NO_DATA'
        }]
      }

      const duration = endTime - startTime
      let currentTime = startTime
      
      // Initialize with the first mode
      let currentMode = this.state.flightModeChanges[0][1]
      
      for (let i = 0; i < this.state.flightModeChanges.length; i++) {
        const modeChange = this.state.flightModeChanges[i]
        const modeTime = modeChange[0]
        const modeName = modeChange[1]
        
        // If this mode change is within our time range
        if (modeTime >= startTime && modeTime <= endTime) {
          // Close previous segment if it exists
          if (currentTime < modeTime) {
            const segmentStart = (currentTime - startTime) / duration
            const segmentEnd = (modeTime - startTime) / duration
            
            segments.push({
              start: segmentStart,
              end: segmentEnd,
              color: this.getModeColor(currentMode),
              mode: currentMode
            })
          }
          
          currentTime = modeTime
          currentMode = modeName
        }
      }
      
      // Add final segment from last mode change to end
      if (currentTime < endTime) {
        const segmentStart = (currentTime - startTime) / duration
        segments.push({
          start: segmentStart,
          end: 1,
          color: this.getModeColor(currentMode),
          mode: currentMode
        })
      }
      
      return segments
    },

    getModeColor (modeName) {
      // Define colors for common flight modes
      const modeColors = {
        'MANUAL': '#ff4444',      // Red
        'STABILIZE': '#ff8800',   // Orange  
        'ALTHOLD': '#ffff00',     // Yellow
        'AUTO': '#44ff44',        // Green
        'GUIDED': '#4444ff',      // Blue
        'LOITER': '#ff44ff',      // Magenta
        'RTL': '#44ffff',         // Cyan
        'CIRCLE': '#8844ff',      // Purple
        'LAND': '#ff8844',        // Orange-red
        'BRAKE': '#888888',       // Gray
        'THROW': '#ffaa44',       // Light orange
        'AVOID_ADSB': '#aa44ff',  // Light purple
        'GUIDED_NOGPS': '#44aaff', // Light blue
        'SMART_RTL': '#aaff44',   // Light green
        'FLOWHOLD': '#ffaa88',    // Light orange-pink
        'FOLLOW': '#88aaff',      // Light blue-purple
        'ZIGZAG': '#aaff88',      // Light green-yellow
        'SYSTEMID': '#ff88aa',    // Light red-purple
        'AUTOROTATE': '#88ffaa',  // Light cyan-green
        'AUTO_RTL': '#aa88ff'     // Light purple-blue
      }
      
      return modeColors[modeName] || '#666666' // Default gray for unknown modes
    }
  },

  computed: {
    availableColorCoders () {
      return {
        'Mode': new ColorCoderMode(this.state),
        'Range': new ColorCoderRange(this.state),
        'Plot': new ColorCoderPlot(this.state)
      }
    },
    useableColorCoders () {
      return this.availableColorCoders
    },

    colorCodeLegend () {
      if (!this.colorCoder || !this.colorCoder.getLegend) return []
      return this.colorCoder.getLegend()
    }
  },

  watch: {
    'state.currentTrajectory': {
      handler: 'loadTrajectoryData',
      deep: true
    },

    'state.showMap': function (newVal) {
      if (newVal && this.map) {
        this.$nextTick(() => {
          this.map.updateSize()
        })
      }
    }
  }
}
</script>

<style scoped>
#wrapper {
    position: relative;
    width: 100%;
    height: 100%;
}

#toolbar {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 1000;
    background: rgba(42, 42, 42, 0.8);
    padding: 10px;
    border-radius: 5px;
}

#mapContainer {
    width: 100%;
    height: calc(100% - 100px); /* Leave space for larger timeline */
}

#timelineContainer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 100px; /* Increased height for time markers */
    background: rgba(42, 42, 42, 0.95);
    border-top: 1px solid #555;
}

/* Timeline Widget Styles */
.timeline-widget {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 10px;
}

.timeline-gps-info {
    display: flex;
    justify-content: center;
    margin-bottom: 5px;
}

.gps-timestamp {
    font-size: 11px;
    color: #ccc;
    background: rgba(0,0,0,0.6);
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid #555;
}

.timeline-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
}

.timeline-btn {
    background: #444;
    color: white;
    border: 1px solid #666;
    border-radius: 3px;
    padding: 5px 10px;
    cursor: pointer;
    font-size: 14px;
}

.timeline-btn:hover {
    background: #555;
}

.time-display {
    color: white;
    font-family: monospace;
    font-size: 14px;
    min-width: 60px;
}

.speed-select {
    background: #444;
    color: white;
    border: 1px solid #666;
    border-radius: 3px;
    padding: 2px 5px;
}

.timeline-track {
    position: relative;
    height: 20px;
    background: #333;
    border-radius: 10px;
    cursor: pointer;
    flex: 1;
    margin-top: 40px; /* More space for time markers */
}

.timeline-time-markers {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 20px; /* Same as timeline track */
    pointer-events: none;
    z-index: 50;
    overflow: visible;
}

.time-marker {
    position: absolute;
    font-size: 9px;
    color: #fff;
    white-space: nowrap;
    user-select: none;
    z-index: 55;
    background: rgba(0,0,0,0.85);
    padding: 1px 2px;
    border-radius: 2px;
    border: 1px solid #666;
    text-shadow: 0 0 2px rgba(0,0,0,0.8);
    font-weight: bold;
}

.time-marker.major-marker {
    z-index: 60;
    transition: all 0.2s ease;
}

.time-marker.major-marker:hover {
    background: rgba(0,100,200,0.9);
    border-color: #0066cc;
    transform: translateX(-50%) scale(1.1);
    font-weight: bold;
}

.time-tick {
    position: absolute;
    background-color: #fff;
    user-select: none;
    z-index: 30;
    box-shadow: 0 0 1px rgba(0,0,0,0.5);
}

.time-tick.major-tick {
    z-index: 35;
    background-color: #fff;
}

.time-tick.minor-tick {
    z-index: 25;
    background-color: #ddd;
}

.time-tick.micro-tick {
    z-index: 20;
    background-color: #bbb;
}

.timeline-background {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #333;
    border-radius: 10px;
}

.timeline-mode-segments {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 10px;
    overflow: hidden;
}

.mode-segment {
    transition: opacity 0.2s ease;
}

.mode-segment:hover {
    opacity: 0.9 !important;
}

.timeline-progress {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    background: linear-gradient(to right, #4CAF50, #81C784);
    border-radius: 10px;
    width: 0%;
    transition: width 0.1s ease;
}

.timeline-thumb {
    position: absolute;
    top: -2px;
    width: 24px;
    height: 24px;
    background: #fff;
    border: 2px solid #4CAF50;
    border-radius: 50%;
    cursor: grab;
    transform: translateX(-50%);
    left: 0%;
}

.timeline-thumb:active {
    cursor: grabbing;
}

.infoPanel {
    color: white;
    font-size: 12px;
}

.color-coding-select {
    background: #2a2a2a;
    color: white;
    border: 1px solid #555;
    border-radius: 3px;
    padding: 2px;
    margin-bottom: 5px;
}

.mode {
    padding: 2px 5px;
    font-weight: bold;
}
</style>
