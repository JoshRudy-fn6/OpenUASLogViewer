<template>
    <div id="wrapper">
        <div id="toolbar">
            <div class="toolbar-section">
                <button class="toolbar-btn center-vehicle-btn" @click="centerOnVehicle" title="Center on Vehicle">
                    🎯
                </button>
                <button class="toolbar-btn zoom-fit-btn" @click="fitToData" title="Zoom to Fit All Data">
                    🔍
                </button>
            </div>
            <div class="toolbar-section">
                <select class="color-coding-select" v-model="selectedColorCoder" v-on:change="updateColor">
                    <option :key="key" :value="key" v-for="(value, key) in useableColorCoders">
                        {{ key }}
                    </option>
                </select>
                <table class="infoPanel">
                    <tbody>
                        <tr v-bind:key="mode[0]" v-for="mode in colorCodeLegend">
                            <td class="mode" v-bind:style="{ color: mode.color }">{{ mode.name }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
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
        style: (feature) => this.getVehicleStyle(),
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
            console.log('=== Loading Trajectory Data ===')
            console.log('Current trajectory length:', this.state.currentTrajectory?.length)
            
            // Convert trajectory data to OpenLayers features
            const trajectoryFeatures = this.createTrajectoryFeatures()
            const vehicleFeature = this.createVehicleFeature()
            const waypointFeatures = this.createWaypointFeatures()
            
            console.log('Created features - trajectory:', trajectoryFeatures.length, 'vehicle:', !!vehicleFeature, 'waypoints:', waypointFeatures.length)

            // Add features to layers
            this.trajectoryLayer.getSource().addFeatures(trajectoryFeatures)
            this.vehicleLayer.getSource().addFeature(vehicleFeature)
            this.waypointsLayer.getSource().addFeatures(waypointFeatures)
            
            console.log('Added features to layers')
            console.log('Vehicle layer features:', this.vehicleLayer.getSource().getFeatures().length)

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
            
            // Create flight mode color-coded segments
            if (this.state.flightModeChanges && this.state.flightModeChanges.length > 0) {
                features.push(...this.createColorCodedTrajectorySegments())
            } else {
                // Fallback to single trajectory line if no flight mode data
                const lineFeature = new Feature({
                    geometry: new LineString(coordinates),
                    type: 'trajectory'
                })
                features.push(lineFeature)
            }
            
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

        createColorCodedTrajectorySegments() {
            const features = []
            const trajectory = this.state.currentTrajectory
            
            if (!trajectory || trajectory.length === 0) {
                return features
            }
            
            let currentSegment = []
            let currentMode = this.getFlightModeAtTime(trajectory[0][3])
            
            for (let i = 0; i < trajectory.length; i++) {
                const point = trajectory[i]
                const pointTime = point[3]
                const pointMode = this.getFlightModeAtTime(pointTime)
                
                // If mode changed, create segment for previous mode and start new one
                if (pointMode !== currentMode && currentSegment.length > 0) {
                    // Add current point to complete the segment
                    currentSegment.push(fromLonLat([point[0], point[1]]))
                    
                    // Create feature for this segment
                    if (currentSegment.length >= 2) {
                        const segmentFeature = new Feature({
                            geometry: new LineString(currentSegment),
                            type: 'trajectory-segment',
                            flightMode: currentMode
                        })
                        
                        // Apply mode-specific styling
                        segmentFeature.setStyle(new Style({
                            stroke: new Stroke({
                                color: this.getModeColor(currentMode),
                                width: 3,
                                lineCap: 'round',
                                lineJoin: 'round'
                            })
                        }))
                        
                        features.push(segmentFeature)
                    }
                    
                    // Start new segment
                    currentSegment = [fromLonLat([point[0], point[1]])]
                    currentMode = pointMode
                } else {
                    currentSegment.push(fromLonLat([point[0], point[1]]))
                }
            }
            
            // Add final segment
            if (currentSegment.length >= 2) {
                const segmentFeature = new Feature({
                    geometry: new LineString(currentSegment),
                    type: 'trajectory-segment',
                    flightMode: currentMode
                })
                
                segmentFeature.setStyle(new Style({
                    stroke: new Stroke({
                        color: this.getModeColor(currentMode),
                        width: 3,
                        lineCap: 'round',
                        lineJoin: 'round'
                    })
                }))
                
                features.push(segmentFeature)
            }
            
            return features
        },

        getFlightModeAtTime(time) {
            if (!this.state.flightModeChanges || this.state.flightModeChanges.length === 0) {
                return 'UNKNOWN'
            }
            
            let currentMode = this.state.flightModeChanges[0][1]
            
            for (const modeChange of this.state.flightModeChanges) {
                if (modeChange[0] > time) {
                    break
                }
                currentMode = modeChange[1]
            }
            
            return currentMode
        },
        
        getTrajectoryStyle () {
          return new Style({
            stroke: new Stroke({
              color: '#ff0000',
              width: 2
            })
          })
        },
        
        getVehicleStyle (heading = 0) {
          // Try a simple circle first to test if the vehicle layer is working
          return new Style({
            image: new CircleStyle({
              radius: 8,
              fill: new Fill({ color: '#ff0000' }),
              stroke: new Stroke({ color: '#ffffff', width: 2 })
            })
          })
          
          // Original icon approach (commented out for testing)
          // return new Style({
          //   image: new Icon({
          //     src: require('@/assets/quadcopter-icon.svg'),
          //     scale: 1.2,
          //     rotation: heading,
          //     rotateWithView: false,
          //     anchor: [0.5, 0.5],
          //     opacity: 1.0
          //   })
          // })
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
          console.log('showAttitude called with time:', time)
          // Update vehicle position and orientation based on time
          this.updateVehiclePosition(time)
        },
        
        updateVehiclePosition (time) {
          console.log('updateVehiclePosition called with time:', time)
          // Find closest trajectory point to the given time
          const trajectory = this.state.currentTrajectory
          if (!trajectory || trajectory.length === 0) {
            console.log('No trajectory data available')
            return
          }
          
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
          console.log('Moving vehicle to point:', point, 'at index:', closestIndex)
          
          const vehicleFeature = this.vehicleLayer.getSource().getFeatures()[0]
          if (vehicleFeature) {
            const newCoords = fromLonLat([point[0], point[1]])
            console.log('Setting vehicle coordinates to:', newCoords)
            vehicleFeature.getGeometry().setCoordinates(newCoords)
          } else {
            console.log('No vehicle feature found in layer')
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

        centerOnVehicle () {
          if (!this.vehicleLayer || !this.map) {
            return
          }
          
          const vehicleFeature = this.vehicleLayer.getSource().getFeatures()[0]
          if (!vehicleFeature) {
            return
          }
          
          const vehicleGeometry = vehicleFeature.getGeometry()
          if (vehicleGeometry) {
            const coordinates = vehicleGeometry.getCoordinates()
            this.map.getView().animate({
              center: coordinates,
              duration: 500,
              zoom: Math.max(this.map.getView().getZoom(), 16) // Ensure minimum zoom level for vehicle visibility
            })
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
    background: rgba(42, 42, 42, 0.9);
    padding: 12px;
    border-radius: 8px;
    border: 1px solid #555;
    backdrop-filter: blur(5px);
}

.toolbar-section {
    margin-bottom: 8px;
}

.toolbar-btn {
    background: rgba(60, 60, 60, 0.8);
    border: 1px solid #666;
    color: #fff;
    padding: 6px 10px;
    margin-right: 5px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
}

.toolbar-btn:hover {
    background: rgba(80, 80, 80, 0.9);
    border-color: #888;
    transform: translateY(-1px);
}

.toolbar-btn:active {
    transform: translateY(0);
}

#mapContainer {
    width: 100%;
    height: calc(100% - 120px); /* Leave space for enhanced timeline */
}

#timelineContainer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 120px; /* Increased height for better controls and time markers */
    background: linear-gradient(180deg, rgba(42, 42, 42, 0.95) 0%, rgba(32, 32, 32, 0.98) 100%);
    border-top: 2px solid #555;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
}

/* Enhanced Timeline Widget Styles */
.timeline-widget {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 12px;
}

.timeline-gps-info {
    display: flex;
    justify-content: center;
    margin-bottom: 8px;
}

.gps-timestamp {
    font-size: 12px;
    font-family: 'Courier New', monospace;
    color: #fff;
    background: linear-gradient(135deg, rgba(0, 100, 200, 0.8) 0%, rgba(0, 80, 160, 0.9) 100%);
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid #0066cc;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.timeline-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 12px;
}

.timeline-btn {
    background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%);
    color: white;
    border: 1px solid #718096;
    border-radius: 6px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    min-width: 40px;
}

.timeline-btn:hover {
    background: linear-gradient(135deg, #5a6578 0%, #3d4758 100%);
    border-color: #a0aec0;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.timeline-btn:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.play-pause-btn {
    background: linear-gradient(135deg, #38a169 0%, #2f855a 100%);
    font-size: 18px;
    min-width: 50px;
}

.play-pause-btn:hover {
    background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
}

.time-display {
    color: #e2e8f0;
    font-family: 'Courier New', monospace;
    font-size: 16px;
    font-weight: bold;
    min-width: 80px;
    text-align: center;
    background: rgba(0, 0, 0, 0.3);
    padding: 6px 10px;
    border-radius: 4px;
    border: 1px solid #4a5568;
}

.speed-select {
    background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%);
    color: white;
    border: 1px solid #718096;
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.speed-select:hover {
    border-color: #a0aec0;
    background: linear-gradient(135deg, #5a6578 0%, #3d4758 100%);
}

.timeline-track {
    position: relative;
    height: 24px;
    background: linear-gradient(180deg, #2d3748 0%, #1a202c 100%);
    border-radius: 12px;
    cursor: pointer;
    flex: 1;
    margin-top: 20px;
    border: 2px solid #4a5568;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
    overflow: hidden;
}

.timeline-time-markers {
    position: absolute;
    top: -25px;
    left: 0;
    right: 0;
    height: 25px;
    pointer-events: none;
    z-index: 50;
    overflow: visible;
}

.time-marker {
    position: absolute;
    font-size: 10px;
    color: #e2e8f0;
    white-space: nowrap;
    user-select: none;
    z-index: 55;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.8) 0%, rgba(26, 32, 44, 0.9) 100%);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #4a5568;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    font-weight: 500;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.time-marker.major-marker {
    z-index: 60;
    transition: all 0.2s ease;
    font-weight: 600;
    font-size: 11px;
}

.time-marker.major-marker:hover {
    background: linear-gradient(135deg, rgba(0, 100, 200, 0.9) 0%, rgba(0, 80, 160, 0.95) 100%);
    border-color: #0066cc;
    transform: translateX(-50%) scale(1.05);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
}

.time-tick {
    position: absolute;
    background-color: #cbd5e0;
    user-select: none;
    z-index: 30;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.3);
}

.time-tick.major-tick {
    z-index: 35;
    background-color: #e2e8f0;
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.4);
}

.time-tick.minor-tick {
    z-index: 25;
    background-color: #a0aec0;
}

.time-tick.micro-tick {
    z-index: 20;
    background-color: #718096;
    opacity: 0.6;
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
    border-radius: 12px;
    overflow: hidden;
    z-index: 10;
}

.mode-segment {
    transition: all 0.3s ease;
    box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.mode-segment:hover {
    opacity: 0.95 !important;
    transform: scaleY(1.1);
    box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2);
    z-index: 15;
}

.timeline-progress {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    background: linear-gradient(90deg, #38a169 0%, #48bb78 50%, #68d391 100%);
    border-radius: 12px;
    width: 0%;
    transition: width 0.1s ease;
    z-index: 20;
    box-shadow: 0 0 8px rgba(56, 161, 105, 0.4);
}

.timeline-thumb {
    position: absolute;
    top: -4px;
    width: 28px;
    height: 28px;
    background: linear-gradient(135deg, #ffffff 0%, #f7fafc 100%);
    border: 3px solid #38a169;
    border-radius: 50%;
    cursor: grab;
    transform: translateX(-50%);
    left: 0%;
    z-index: 30;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3), 0 0 0 2px rgba(56, 161, 105, 0.2);
    transition: all 0.2s ease;
}

.timeline-thumb:hover {
    transform: translateX(-50%) scale(1.1);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4), 0 0 0 3px rgba(56, 161, 105, 0.3);
}

.timeline-thumb:active {
    cursor: grabbing;
    transform: translateX(-50%) scale(0.95);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3), 0 0 0 2px rgba(56, 161, 105, 0.4);
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
