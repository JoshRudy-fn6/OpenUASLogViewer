<template>
    <div id="wrapper">
        <div id="toolbar" :class="{ 'toolbar-collapsed': toolbarCollapsed }">
            <button class="toolbar-collapse-btn" @click="toggleToolbar" :title="toolbarCollapsed ? 'Expand Toolbar' : 'Collapse Toolbar'">
                <span v-if="!toolbarCollapsed">◀</span>
                <span v-else>▶</span>
            </button>
            <div class="toolbar-content" v-show="!toolbarCollapsed">
                <div class="toolbar-section">
                    <select class="color-coding-select" v-model="selectedColorCoder" v-on:change="updateColor">
                        <option :key="key" :value="key" v-for="(value, key) in useableColorCoders">
                            {{ key }}
                        </option>
                    </select>
                </div>
                <div class="toolbar-section">
                    <button class="toolbar-btn" @click="centerOnTrajectory">Center View</button>
                    <button class="toolbar-btn" @click="resetCamera">Reset Camera</button>
                </div>
                <div class="toolbar-section">
                    <label style="color: white; font-size: 12px;">
                        <input type="checkbox" v-model="showGrid" @change="toggleGrid"> Show Grid
                    </label>
                    <label style="color: white; font-size: 12px; margin-top: 5px;">
                        <input type="checkbox" v-model="showTerrain" @change="toggleTerrain"> Show Terrain
                    </label>
                </div>
                <div class="toolbar-section">
                    <label style="color: white; font-size: 11px; margin-bottom: 3px;">Map Type:</label>
                    <select class="map-type-select" v-model="satelliteSource" @change="reloadSatelliteImagery">
                        <option value="2">Satellite (Esri)</option>
                        <option value="0">Street Map (OSM)</option>
                        <option value="1">Topographic</option>
                        <option value="3">Terrain (Stamen)</option>
                    </select>
                </div>
                <div class="toolbar-section">
                    <table class="infoPanel">
                        <tbody>
                            <tr v-bind:key="mode[0]" v-for="mode in colorCodeLegend">
                                <td class="mode" v-bind:style="{ color: mode.color }">{{ mode.name }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        <div id="threeContainer" ref="threeContainer"></div>
        <div id="timelineContainer" ref="timelineContainer"></div>
    </div>
</template>

<script>
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { store } from './Globals.js'
import { OpenLayersTimeline, TimelineWidget } from './openLayersExtra/timeline.js'

// Simple color coders without Cesium dependencies
class SimpleColorCoderMode {
  constructor (state) {
    this.state = state
  }

  getLegend () {
    const legend = []
    if (this.state.flightModeChanges) {
      const modes = new Set()
      this.state.flightModeChanges.forEach(mode => modes.add(mode[1]))
      let index = 0
      modes.forEach(modeName => {
        const color = this.state.cssColors && this.state.cssColors[index] 
          ? this.state.cssColors[index] 
          : '#666666'
        legend.push({ name: modeName, color: color })
        index++
      })
    }
    return legend
  }
}

class SimpleColorCoderRange {
  constructor (state) {
    this.state = state
  }

  getLegend () {
    return [{ name: 'Range Based', color: '#00ff00' }]
  }
}

class SimpleColorCoderPlot {
  constructor (state) {
    this.state = state
  }

  getLegend () {
    return [{ name: 'Plot Based', color: '#0000ff' }]
  }
}

export default {
  name: 'ThreeJSViewer',
  data () {
    return {
      state: store,
      scene: null,
      camera: null,
      renderer: null,
      controls: null,
      trajectoryLine: null,
      vehicleMarker: null,
      gridHelper: null,
      showGrid: true,
      toolbarCollapsed: false,
      selectedColorCoder: 'Mode',
      colorCoder: null,
      animationId: null,
      terrainPlane: null,
      terrainTexture: null,
      showTerrain: true,
      satelliteSource: 2,
      trajectoryBounds: null,
      timeline: null,
      timelineWidget: null,
      trajectorySegments: [],
      yawSmoothingBuffer: [],
      yawSmoothingSize: 5,
      compassRotation: 0
    }
  },
  
  computed: {
    availableColorCoders () {
      return {
        'Mode': new SimpleColorCoderMode(this.state),
        'Range': new SimpleColorCoderRange(this.state),
        'Plot': new SimpleColorCoderPlot(this.state)
      }
    },
    useableColorCoders () {
      return this.availableColorCoders
    },
    colorCodeLegend () {
      if (!this.colorCoder || !this.colorCoder.getLegend) return []
      return this.colorCoder.getLegend()
    },
    setOfModes () {
      const set = []
      if (this.state.flightModeChanges) {
        for (const mode of this.state.flightModeChanges) {
          if (!set.includes(mode[1])) {
            set.push(mode[1])
          }
        }
      }
      return set
    }
  },
  
  mounted () {
    // Restore toolbar state from localStorage
    const savedState = localStorage.getItem('threeJSToolbarCollapsed')
    if (savedState !== null) {
      this.toolbarCollapsed = savedState === 'true'
    }
    
    // Read compass rotation from parameters
    this.readCompassParameters()
    
    this.initThreeJS()
    this.colorCoder = this.availableColorCoders[this.selectedColorCoder]
    this.initializeTimeline()
    
    // Load trajectory if it already exists
    if (this.state.currentTrajectory && this.state.currentTrajectory.length > 0) {
      this.loadTrajectoryData()
    }
    
    // Watch for trajectory changes
    this.$watch('state.currentTrajectory', () => {
      this.loadTrajectoryData()
    }, { deep: true })
    
    // Listen for time updates from timeline
    if (this.$eventHub) {
      this.$eventHub.$on('cesium-time-changed', this.onTimeChanged)
    }
  },
  
  beforeDestroy () {
    // Clean up
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
    }
    
    if (this.$eventHub) {
      this.$eventHub.$off('cesium-time-changed', this.onTimeChanged)
    }
    
    if (this.renderer) {
      this.renderer.dispose()
    }
    
    if (this.controls) {
      this.controls.dispose()
    }
  },
  
  methods: {
    toggleToolbar () {
      this.toolbarCollapsed = !this.toolbarCollapsed
      localStorage.setItem('threeJSToolbarCollapsed', this.toolbarCollapsed)
    },
    
    initThreeJS () {
      const container = this.$refs.threeContainer
      
      // Create scene
      this.scene = new THREE.Scene()
      this.scene.background = new THREE.Color(0x1a1f2e)
      
      // Create camera
      const aspect = container.clientWidth / container.clientHeight
      this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 10000)
      this.camera.position.set(0, 500, 1000)
      this.camera.lookAt(0, 0, 0)
      
      // Create renderer
      this.renderer = new THREE.WebGLRenderer({ antialias: true })
      this.renderer.setSize(container.clientWidth, container.clientHeight)
      this.renderer.setPixelRatio(window.devicePixelRatio)
      container.appendChild(this.renderer.domElement)
      
      // Add orbit controls
      this.controls = new OrbitControls(this.camera, this.renderer.domElement)
      this.controls.enableDamping = true
      this.controls.dampingFactor = 0.05
      this.controls.screenSpacePanning = false
      this.controls.minDistance = 50
      this.controls.maxDistance = 5000
      this.controls.maxPolarAngle = Math.PI
      
      // Add lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
      this.scene.add(ambientLight)
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
      directionalLight.position.set(100, 100, 50)
      this.scene.add(directionalLight)
      
      // Add grid helper
      this.gridHelper = new THREE.GridHelper(2000, 40, 0x444444, 0x2a2a2a)
      this.scene.add(this.gridHelper)
      
      // Add axis helper for orientation
      const axesHelper = new THREE.AxesHelper(100)
      this.scene.add(axesHelper)
      
      // Create terrain plane with satellite imagery
      this.createTerrainPlane()
      
      // Handle window resize
      window.addEventListener('resize', this.onWindowResize)
      
      // Start animation loop
      this.animate()
    },
    
    animate () {
      this.animationId = requestAnimationFrame(this.animate)
      
      if (this.controls) {
        this.controls.update()
      }
      
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera)
      }
    },
    
    onWindowResize () {
      const container = this.$refs.threeContainer
      if (!container) return
      
      this.camera.aspect = container.clientWidth / container.clientHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(container.clientWidth, container.clientHeight)
    },
    
    loadTrajectoryData () {
      if (!this.state.currentTrajectory || this.state.currentTrajectory.length === 0) {
        return
      }
      
      // Remove existing trajectory
      if (this.trajectoryLine) {
        this.scene.remove(this.trajectoryLine)
        this.trajectoryLine.geometry.dispose()
        this.trajectoryLine.material.dispose()
      }
      
      // Remove existing vehicle marker
      if (this.vehicleMarker) {
        this.scene.remove(this.vehicleMarker)
        this.vehicleMarker.geometry.dispose()
        this.vehicleMarker.material.dispose()
      }
      
      // Create trajectory segments colored by flight mode
      const segments = this.createColoredTrajectorySegments()
      this.trajectorySegments = segments
      segments.forEach(segment => this.scene.add(segment))
      
      // Create vehicle marker
      this.createVehicleMarker()
      
      // Update or create terrain plane
      if (this.terrainPlane) {
        this.scene.remove(this.terrainPlane)
        this.terrainPlane.geometry.dispose()
        this.terrainPlane.material.dispose()
      }
      this.createTerrainPlane()
      
      // Setup timeline
      if (this.timeline) {
        this.setupTimelineData()
      }
      
      // Center camera on trajectory
      this.centerOnTrajectory()
    },
    
    createColoredTrajectorySegments () {
      const trajectory = this.state.currentTrajectory
      const segments = []
      
      // Scale factor to convert GPS coordinates to scene units
      // Center the trajectory around origin
      const latitudes = trajectory.map(p => p[1])
      const longitudes = trajectory.map(p => p[0])
      const altitudes = trajectory.map(p => p[2])
      
      const centerLat = (Math.min(...latitudes) + Math.max(...latitudes)) / 2
      const centerLon = (Math.min(...longitudes) + Math.max(...longitudes)) / 2
      const minAlt = Math.min(...altitudes)
      
      // Approximate meters per degree at this latitude
      const metersPerDegreeLat = 111320
      const metersPerDegreeLon = 111320 * Math.cos(centerLat * Math.PI / 180)
      
      let currentMode = this.getFlightModeAtTime(trajectory[0][3])
      let currentSegment = []
      
      for (let i = 0; i < trajectory.length; i++) {
        const point = trajectory[i]
        const lat = point[1]
        const lon = point[0]
        const alt = point[2]
        const time = point[3]
        
        // Convert to scene coordinates
        const x = (lon - centerLon) * metersPerDegreeLon
        const z = -(lat - centerLat) * metersPerDegreeLat // Negative to match standard coordinate system
        const y = alt - minAlt
        
        const pointMode = this.getFlightModeAtTime(time)
        
        // If mode changed, create segment for previous mode
        if (pointMode !== currentMode && currentSegment.length > 0) {
          currentSegment.push(new THREE.Vector3(x, y, z))
          
          // Create line segment
          const geometry = new THREE.BufferGeometry().setFromPoints(currentSegment)
          const material = new THREE.LineBasicMaterial({
            color: new THREE.Color(this.getModeColor(currentMode)),
            linewidth: 3
          })
          const line = new THREE.Line(geometry, material)
          segments.push(line)
          
          // Start new segment
          currentSegment = [new THREE.Vector3(x, y, z)]
          currentMode = pointMode
        } else {
          currentSegment.push(new THREE.Vector3(x, y, z))
        }
      }
      
      // Add final segment
      if (currentSegment.length >= 2) {
        const geometry = new THREE.BufferGeometry().setFromPoints(currentSegment)
        const material = new THREE.LineBasicMaterial({
          color: new THREE.Color(this.getModeColor(currentMode)),
          linewidth: 3
        })
        const line = new THREE.Line(geometry, material)
        segments.push(line)
      }
      
      return segments
    },
    
    getFlightModeAtTime (time) {
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
    
    getYawAtTime (time) {
      // Get yaw (compass heading) from ATT or ATTITUDE messages
      // ATT is dataflash format, ATTITUDE is mavlink format
      const attMessages = this.state.messages.ATT || this.state.messages.ATTITUDE
      
      if (!attMessages || !attMessages.time_boot_ms) {
        return 0
      }
      
      // Find closest time index
      const times = attMessages.time_boot_ms
      let closestIndex = 0
      let minTimeDiff = Math.abs(times[0] - time)
      
      for (let i = 1; i < times.length; i++) {
        const timeDiff = Math.abs(times[i] - time)
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff
          closestIndex = i
        } else {
          break // Times are sorted, so we can break early
        }
      }
      
      // Get yaw from messages (could be 'Yaw' for dataflash or 'yaw' for mavlink)
      const yaw = attMessages.Yaw ? attMessages.Yaw[closestIndex] : attMessages.yaw[closestIndex]
      
      return yaw || 0
    },
    
    readCompassParameters () {
      // Read compass rotation offset from parameters
      // COMPASS_ORIENT can be:
      // 0 = None, 1 = Yaw45, 2 = Yaw90, 3 = Yaw135, 4 = Yaw180, 5 = Yaw225, 6 = Yaw270, 7 = Yaw315
      // 8+ are pitch/roll combinations
      
      if (!window.params) {
        return
      }
      
      // Try to get primary compass index (defaults to 0)
      let primaryCompass = 0
      if ('COMPASS_PRIMARY' in window.params) {
        primaryCompass = window.params.COMPASS_PRIMARY
      } else if ('COMPASS_USE' in window.params) {
        primaryCompass = window.params.COMPASS_USE
      }
      
      // Get orientation for the primary compass
      let orientParam = 'COMPASS_ORIENT'
      if (primaryCompass > 0) {
        // Try new format first (COMPASS2_ORIENT, COMPASS3_ORIENT)
        orientParam = `COMPASS${primaryCompass + 1}_ORIENT`
        if (!(orientParam in window.params)) {
          // Try old format (COMPASS_ORIENT2, COMPASS_ORIENT3)
          orientParam = `COMPASS_ORIENT${primaryCompass + 1}`
        }
      }
      
      if (orientParam in window.params) {
        const orientation = window.params[orientParam]
        
        // Convert orientation codes to rotation angles (radians)
        const orientationMap = {
          0: 0,                    // None
          1: Math.PI / 4,         // Yaw45
          2: Math.PI / 2,         // Yaw90
          3: 3 * Math.PI / 4,     // Yaw135
          4: Math.PI,             // Yaw180
          5: 5 * Math.PI / 4,     // Yaw225
          6: 3 * Math.PI / 2,     // Yaw270
          7: 7 * Math.PI / 4      // Yaw315
        }
        
        if (orientation in orientationMap) {
          this.compassRotation = orientationMap[orientation]
          console.log(`Using compass rotation offset: ${(orientation * 45)} degrees`)
        }
      }
    },
    
    getSmoothedYaw (yaw) {
      // Add current yaw to smoothing buffer
      this.yawSmoothingBuffer.push(yaw)
      
      // Keep buffer size limited
      if (this.yawSmoothingBuffer.length > this.yawSmoothingSize) {
        this.yawSmoothingBuffer.shift()
      }
      
      // Handle angle wrapping for averaging (deal with 0/2π boundary)
      // Convert to unit vectors, average, then convert back to angle
      let sumSin = 0
      let sumCos = 0
      
      for (const angle of this.yawSmoothingBuffer) {
        sumSin += Math.sin(angle)
        sumCos += Math.cos(angle)
      }
      
      const avgSin = sumSin / this.yawSmoothingBuffer.length
      const avgCos = sumCos / this.yawSmoothingBuffer.length
      
      return Math.atan2(avgSin, avgCos)
    },
    
    getModeColor (modeName) {
      const modeIndex = this.setOfModes.indexOf(modeName)
      
      if (modeIndex >= 0 && this.state.cssColors && this.state.cssColors[modeIndex]) {
        return this.state.cssColors[modeIndex]
      }
      
      return '#666666'
    },
    
    createVehicleMarker () {
      if (!this.state.currentTrajectory || this.state.currentTrajectory.length === 0) {
        return
      }
      
      const firstPoint = this.state.currentTrajectory[0]
      
      // Create arrow shape for vehicle marker
      // Arrow points in +Z direction (north), will be rotated by yaw
      const arrowShape = new THREE.Shape()
      
      // Arrow dimensions (smaller than sphere)
      const length = 8
      const width = 4
      const headLength = 3
      const headWidth = 6
      
      // Draw arrow pointing up (north/+Z)
      arrowShape.moveTo(0, length / 2) // tip
      arrowShape.lineTo(-headWidth / 2, length / 2 - headLength) // left head
      arrowShape.lineTo(-width / 2, length / 2 - headLength) // left body
      arrowShape.lineTo(-width / 2, -length / 2) // left tail
      arrowShape.lineTo(width / 2, -length / 2) // right tail
      arrowShape.lineTo(width / 2, length / 2 - headLength) // right body
      arrowShape.lineTo(headWidth / 2, length / 2 - headLength) // right head
      arrowShape.lineTo(0, length / 2) // back to tip
      
      const extrudeSettings = {
        depth: 2,
        bevelEnabled: true,
        bevelThickness: 0.3,
        bevelSize: 0.3,
        bevelSegments: 2
      }
      
      const geometry = new THREE.ExtrudeGeometry(arrowShape, extrudeSettings)
      const material = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.5,
        metalness: 0.3,
        roughness: 0.7
      })
      
      this.vehicleMarker = new THREE.Mesh(geometry, material)
      
      // Rotate arrow to lie flat (parallel to ground)
      // and point in correct direction
      this.vehicleMarker.rotation.x = -Math.PI / 2
      
      // Position at first trajectory point
      const trajectory = this.state.currentTrajectory
      const latitudes = trajectory.map(p => p[1])
      const longitudes = trajectory.map(p => p[0])
      const altitudes = trajectory.map(p => p[2])
      
      const centerLat = (Math.min(...latitudes) + Math.max(...latitudes)) / 2
      const centerLon = (Math.min(...longitudes) + Math.max(...longitudes)) / 2
      const minAlt = Math.min(...altitudes)
      
      const metersPerDegreeLat = 111320
      const metersPerDegreeLon = 111320 * Math.cos(centerLat * Math.PI / 180)
      
      const x = (firstPoint[0] - centerLon) * metersPerDegreeLon
      const z = -(firstPoint[1] - centerLat) * metersPerDegreeLat
      const y = firstPoint[2] - minAlt
      
      this.vehicleMarker.position.set(x, y, z)
      this.scene.add(this.vehicleMarker)
    },
    
    onTimeChanged (time) {
      // Update vehicle marker position based on time
      if (!this.vehicleMarker || !this.state.currentTrajectory) {
        return
      }
      
      const trajectory = this.state.currentTrajectory
      
      // Find closest trajectory point to the given time
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
      
      // Convert to scene coordinates
      const latitudes = trajectory.map(p => p[1])
      const longitudes = trajectory.map(p => p[0])
      const altitudes = trajectory.map(p => p[2])
      
      const centerLat = (Math.min(...latitudes) + Math.max(...latitudes)) / 2
      const centerLon = (Math.min(...longitudes) + Math.max(...longitudes)) / 2
      const minAlt = Math.min(...altitudes)
      
      const metersPerDegreeLat = 111320
      const metersPerDegreeLon = 111320 * Math.cos(centerLat * Math.PI / 180)
      
      const x = (point[0] - centerLon) * metersPerDegreeLon
      const z = -(point[1] - centerLat) * metersPerDegreeLat
      const y = point[2] - minAlt
      
      this.vehicleMarker.position.set(x, y, z)
      
      // Rotate vehicle marker to match compass heading (yaw)
      const rawYaw = this.getYawAtTime(time)
      const smoothedYaw = this.getSmoothedYaw(rawYaw)
      
      // Apply compass rotation offset and set marker rotation
      // Yaw is in radians, pointing north = 0, clockwise positive
      // Our arrow points in +Z direction after x-rotation, so rotate around Y axis
      this.vehicleMarker.rotation.z = -(smoothedYaw + this.compassRotation)
    },
    
    centerOnTrajectory () {
      if (!this.state.currentTrajectory || this.state.currentTrajectory.length === 0) {
        return
      }
      
      const trajectory = this.state.currentTrajectory
      const latitudes = trajectory.map(p => p[1])
      const longitudes = trajectory.map(p => p[0])
      const altitudes = trajectory.map(p => p[2])
      
      const centerLat = (Math.min(...latitudes) + Math.max(...latitudes)) / 2
      const centerLon = (Math.min(...longitudes) + Math.max(...longitudes)) / 2
      const centerAlt = (Math.min(...altitudes) + Math.max(...altitudes)) / 2
      const minAlt = Math.min(...altitudes)
      
      const metersPerDegreeLat = 111320
      const metersPerDegreeLon = 111320 * Math.cos(centerLat * Math.PI / 180)
      
      const latRange = (Math.max(...latitudes) - Math.min(...latitudes)) * metersPerDegreeLat
      const lonRange = (Math.max(...longitudes) - Math.min(...longitudes)) * metersPerDegreeLon
      const altRange = Math.max(...altitudes) - Math.min(...altitudes)
      
      const maxRange = Math.max(latRange, lonRange, altRange)
      
      // Position camera to view entire trajectory
      const distance = maxRange * 1.5
      this.camera.position.set(0, distance * 0.7, distance)
      this.camera.lookAt(0, (centerAlt - minAlt), 0)
      this.controls.target.set(0, (centerAlt - minAlt), 0)
      this.controls.update()
    },
    
    resetCamera () {
      this.camera.position.set(0, 500, 1000)
      this.camera.lookAt(0, 0, 0)
      this.controls.target.set(0, 0, 0)
      this.controls.update()
    },
    
    toggleGrid () {
      if (this.gridHelper) {
        this.gridHelper.visible = this.showGrid
      }
    },
    
    updateColor () {
      this.colorCoder = this.availableColorCoders[this.selectedColorCoder]
      this.loadTrajectoryData()
    },
    
    createTerrainPlane () {
      if (!this.state.currentTrajectory || this.state.currentTrajectory.length === 0) {
        return
      }
      
      const trajectory = this.state.currentTrajectory
      const latitudes = trajectory.map(p => p[1])
      const longitudes = trajectory.map(p => p[0])
      
      const minLat = Math.min(...latitudes)
      const maxLat = Math.max(...latitudes)
      const minLon = Math.min(...longitudes)
      const maxLon = Math.max(...longitudes)
      
      // Store bounds for reload
      this.trajectoryBounds = { minLat, maxLat, minLon, maxLon }
      
      const centerLat = (minLat + maxLat) / 2
      const centerLon = (minLon + maxLon) / 2
      
      const metersPerDegreeLat = 111320
      const metersPerDegreeLon = 111320 * Math.cos(centerLat * Math.PI / 180)
      
      const latRange = (maxLat - minLat) * metersPerDegreeLat
      const lonRange = (maxLon - minLon) * metersPerDegreeLon
      
      const planeWidth = Math.max(lonRange, 1000) * 2
      const planeHeight = Math.max(latRange, 1000) * 2
      
      // Create a textured plane for satellite/terrain imagery
      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight, 32, 32)
      
      // Load satellite imagery dynamically based on trajectory bounds
      this.loadSatelliteImagery(minLat, maxLat, minLon, maxLon, planeWidth, planeHeight, geometry)
    },
    
    async loadSatelliteImagery (minLat, maxLat, minLon, maxLon, planeWidth, planeHeight, geometry) {
      // Calculate appropriate zoom level based on area coverage
      // Higher zoom = more detail but slower loading
      const latSpan = maxLat - minLat
      const lonSpan = maxLon - minLon
      const maxSpan = Math.max(latSpan, lonSpan)
      
      // Auto-calculate zoom level (rough approximation)
      // zoom 10 = ~5km per tile, zoom 15 = ~150m per tile, zoom 18 = ~20m per tile
      let zoom = 15
      if (maxSpan > 0.1) zoom = 12      // Large area (>10km)
      else if (maxSpan > 0.01) zoom = 15 // Medium area (1-10km)
      else zoom = 17                      // Small area (<1km)
      
      // Calculate center tile coordinates
      const centerLat = (minLat + maxLat) / 2
      const centerLon = (minLon + maxLon) / 2
      
      // Convert lat/lon to tile coordinates
      const getTileCoords = (lat, lon, z) => {
        const x = Math.floor((lon + 180) / 360 * Math.pow(2, z))
        const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z))
        return { x, y, z }
      }
      
      const centerTile = getTileCoords(centerLat, centerLon, zoom)
      
      // Determine how many tiles we need to cover the area
      const tilesNeeded = Math.ceil(Math.max(planeWidth, planeHeight) / 256 / Math.pow(2, 18 - zoom))
      const tileRadius = Math.max(1, Math.min(tilesNeeded, 3)) // Limit to 3 tiles in each direction
      
      // Create a canvas to composite multiple tiles
      const canvasSize = 1024
      const canvas = document.createElement('canvas')
      canvas.width = canvasSize
      canvas.height = canvasSize
      const ctx = canvas.getContext('2d')
      
      // Fill with a base color while loading
      ctx.fillStyle = '#2d5016'
      ctx.fillRect(0, 0, canvasSize, canvasSize)
      
      // Load tiles from multiple free sources (with fallbacks)
      // Using OpenStreetMap and Stamen terrain tiles (all free and open)
      const tileUrls = [
        // OpenStreetMap Standard (always available, no API key)
        (x, y, z) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
        
        // OpenTopoMap (topographic style, no API key)
        (x, y, z) => `https://tile.opentopomap.org/${z}/${x}/${y}.png`,
        
        // Esri World Imagery (satellite, free but requires attribution)
        (x, y, z) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
        
        // Stamen Terrain (terrain style, no API key)
        (x, y, z) => `https://tiles.stadiamaps.com/tiles/stamen_terrain/${z}/${x}/${y}.png`
      ]
      
      // Use the user-selected satellite source
      let selectedSource = this.satelliteSource
      
      const loadTileImage = (url) => {
        return new Promise((resolve, reject) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = url
        })
      }
      
      // Load center tile and adjacent tiles to create a composite image
      const tilesToLoad = []
      for (let dy = -tileRadius; dy <= tileRadius; dy++) {
        for (let dx = -tileRadius; dx <= tileRadius; dx++) {
          tilesToLoad.push({
            x: centerTile.x + dx,
            y: centerTile.y + dy,
            dx,
            dy
          })
        }
      }
      
      // Load tiles sequentially to avoid overwhelming the server
      let loadedCount = 0
      const totalTiles = tilesToLoad.length
      
      for (const tile of tilesToLoad) {
        try {
          const url = tileUrls[selectedSource](tile.x, tile.y, zoom)
          const img = await loadTileImage(url)
          
          // Calculate position on canvas
          const tileSize = canvasSize / (tileRadius * 2 + 1)
          const canvasX = (tile.dx + tileRadius) * tileSize
          const canvasY = (tile.dy + tileRadius) * tileSize
          
          ctx.drawImage(img, canvasX, canvasY, tileSize, tileSize)
          loadedCount++
          
          // Update texture progressively as tiles load
          if (loadedCount === 1 || loadedCount === totalTiles || loadedCount % 3 === 0) {
            if (this.terrainTexture) {
              this.terrainTexture.needsUpdate = true
            }
          }
        } catch (error) {
          // If tile fails to load, try fallback source
          if (selectedSource < tileUrls.length - 1) {
            console.log(`Tile load failed, trying fallback source...`)
            selectedSource++
            
            try {
              const fallbackUrl = tileUrls[selectedSource](tile.x, tile.y, zoom)
              const img = await loadTileImage(fallbackUrl)
              
              const tileSize = canvasSize / (tileRadius * 2 + 1)
              const canvasX = (tile.dx + tileRadius) * tileSize
              const canvasY = (tile.dy + tileRadius) * tileSize
              
              ctx.drawImage(img, canvasX, canvasY, tileSize, tileSize)
              loadedCount++
            } catch (fallbackError) {
              console.warn(`Failed to load tile ${tile.x},${tile.y} even with fallback:`, fallbackError)
            }
          }
        }
      }
      
      // Create texture from composite canvas
      this.terrainTexture = new THREE.CanvasTexture(canvas)
      this.terrainTexture.wrapS = THREE.ClampToEdgeWrapping
      this.terrainTexture.wrapT = THREE.ClampToEdgeWrapping
      this.terrainTexture.minFilter = THREE.LinearFilter
      this.terrainTexture.magFilter = THREE.LinearFilter
      
      const material = new THREE.MeshStandardMaterial({
        map: this.terrainTexture,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0.1
      })
      
      this.terrainPlane = new THREE.Mesh(geometry, material)
      this.terrainPlane.rotation.x = -Math.PI / 2
      this.terrainPlane.position.y = -10
      this.scene.add(this.terrainPlane)
      
      console.log(`Loaded ${loadedCount}/${totalTiles} satellite tiles at zoom level ${zoom}`)
    },
    
    toggleTerrain () {
      if (this.terrainPlane) {
        this.terrainPlane.visible = this.showTerrain
      }
    },
    
    reloadSatelliteImagery () {
      // Remove existing terrain plane
      if (this.terrainPlane) {
        this.scene.remove(this.terrainPlane)
        if (this.terrainPlane.geometry) this.terrainPlane.geometry.dispose()
        if (this.terrainPlane.material) {
          if (this.terrainPlane.material.map) this.terrainPlane.material.map.dispose()
          this.terrainPlane.material.dispose()
        }
        this.terrainPlane = null
      }
      
      // Recreate terrain with new imagery source
      if (this.trajectoryBounds) {
        const { minLat, maxLat, minLon, maxLon } = this.trajectoryBounds
        const centerLat = (minLat + maxLat) / 2
        const centerLon = (minLon + maxLon) / 2
        
        const metersPerDegreeLat = 111320
        const metersPerDegreeLon = 111320 * Math.cos(centerLat * Math.PI / 180)
        
        const latRange = (maxLat - minLat) * metersPerDegreeLat
        const lonRange = (maxLon - minLon) * metersPerDegreeLon
        
        const planeWidth = Math.max(lonRange, 1000) * 2
        const planeHeight = Math.max(latRange, 1000) * 2
        
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight, 32, 32)
        this.loadSatelliteImagery(minLat, maxLat, minLon, maxLon, planeWidth, planeHeight, geometry)
      }
    },
    
    initializeTimeline () {
      this.timeline = new OpenLayersTimeline(this, {
        updateInterval: 50,
        autoLoop: false
      })
      
      this.timeline.eventHub = this.$eventHub
      
      this.timelineWidget = new TimelineWidget(this.$refs.timelineContainer, this.timeline)
      
      if (this.state.currentTrajectory && this.state.currentTrajectory.length > 0) {
        this.setupTimelineData()
      }
    },
    
    setupTimelineData () {
      if (!this.timeline || !this.state.currentTrajectory || this.state.currentTrajectory.length === 0) {
        return
      }
      
      const times = this.state.currentTrajectory.map(point => point[3])
      const startTime = Math.min(...times)
      const endTime = Math.max(...times)
      
      this.timeline.setTimeRange(startTime, endTime)
      this.timeline.setCurrentTime(startTime)
      
      this.setupTimelineColorCoding(startTime, endTime)
      
      if (this.timelineWidget) {
        this.timelineWidget.refreshGPSDisplay()
      }
    },
    
    setupTimelineColorCoding (startTime, endTime) {
      const modeSegments = this.createModeSegments(startTime, endTime)
      if (this.timelineWidget) {
        this.timelineWidget.setModeSegments(modeSegments)
      }
    },
    
    createModeSegments (startTime, endTime) {
      const segments = []
      
      if (!this.state.flightModeChanges || this.state.flightModeChanges.length === 0) {
        return [{ start: 0, end: 1, color: '#666', mode: 'NO_DATA' }]
      }
      
      const duration = endTime - startTime
      let currentTime = startTime
      let currentMode = this.state.flightModeChanges[0][1]
      
      for (let i = 0; i < this.state.flightModeChanges.length; i++) {
        const modeChange = this.state.flightModeChanges[i]
        const modeTime = modeChange[0]
        const modeName = modeChange[1]
        
        if (modeTime >= startTime && modeTime <= endTime) {
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
    
    showAttitude (time) {
      this.onTimeChanged(time)
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
    transition: all 0.3s ease;
    max-width: 300px;
}

#toolbar.toolbar-collapsed {
    padding: 8px;
    background: rgba(42, 42, 42, 0.85);
}

.toolbar-collapse-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(60, 60, 60, 0.9);
    border: 1px solid #666;
    color: #fff;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s ease;
    z-index: 1001;
}

.toolbar-collapse-btn:hover {
    background: rgba(80, 80, 80, 0.9);
    border-color: #888;
}

.toolbar-content {
    transition: opacity 0.3s ease;
}

.toolbar-section {
    margin-bottom: 10px;
}

.toolbar-btn {
    background: rgba(60, 60, 60, 0.8);
    border: 1px solid #666;
    color: #fff;
    padding: 6px 10px;
    margin-right: 5px;
    margin-bottom: 5px;
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

.color-coding-select {
    background: linear-gradient(145deg, #3a4556 0%, #2d3748 100%) !important;
    color: #e2e8f0 !important;
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 6px 10px;
    border-radius: 4px;
    width: 100%;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.map-type-select {
    background: linear-gradient(145deg, #3a4556 0%, #2d3748 100%) !important;
    color: #e2e8f0 !important;
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 6px 10px;
    border-radius: 4px;
    width: 100%;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.map-type-select:hover,
.color-coding-select:hover {
    background: linear-gradient(145deg, #4a5566 0%, #3d4758 100%) !important;
    border-color: rgba(255, 255, 255, 0.2);
}

.color-coding-select option,
.map-type-select option {
    background-color: #2d3748 !important;
    color: #ffffff !important;
}

.color-coding-select:focus {
    outline: none;
    border-color: #2196F3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.infoPanel {
    width: 100%;
    color: white;
    font-size: 12px;
    border-collapse: collapse;
}

.infoPanel td {
    padding: 3px 8px;
}

.mode {
    font-weight: 600;
}

#threeContainer {
    width: 100%;
    height: calc(100% - 130px);
    overflow: hidden;
}

#timelineContainer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 130px;
    background: linear-gradient(180deg, rgba(30, 33, 38, 0.98) 0%, rgba(20, 22, 25, 0.99) 100%);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5), 0 -1px 0 rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
}
</style>
