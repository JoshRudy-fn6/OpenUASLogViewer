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
      currentTimeIndex: 0
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
    height: 100%;
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
