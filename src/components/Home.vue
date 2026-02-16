<template>
    <div id='vuewrapper' style="height: 100%;">
        <template v-if="state.mapLoading || state.plotLoading">
            <div id="waiting">
                <atom-spinner
                    :animation-duration="1000"
                    :color="'#64e9ff'"
                    :size="300"
                />
            </div>
        </template>
        <TxInputs fixed-aspect-ratio v-if="state.mapAvailable && state.showMap && state.showRadio"></TxInputs>
        <ParamViewer    @close="state.showParams = false" v-if="state.showParams"></ParamViewer>
        <MessageViewer  @close="state.showMessages = false" v-if="state.showMessages"></MessageViewer>
        <DeviceIDViewer @close="state.showDeviceIDs = false" v-if="state.showDeviceIDs"></DeviceIDViewer>
        <AttitudeViewer @close="state.showAttitude = false" v-if="state.showAttitude"></AttitudeViewer>
        <MagFitTool     @close="state.showMagfit = false" v-if="state.showMagfit"></MagFitTool>
        <EkfHelperTool  @close="state.showEkfHelper = false" v-if="state.showEkfHelper"></EkfHelperTool>
        <div class="container-fluid" style="height: 100%; overflow: hidden;">

            <sidebar/>

            <main class="col-md-9 ml-sm-auto col-lg-10 flex-column d-sm-flex" role="main">

                <div class="row"
                     v-bind:class="[state.showMap ? 'h-50' : 'h-100']"
                     v-if="state.plotOn">
                    <div class="col-12">
                        <Plotly/>
                    </div>
                </div>
                <div class="row" v-bind:class="[state.plotOn ? 'h-50' : 'h-100']"
                     v-if="state.mapAvailable && mapOk && state.showMap">
                    <div class="col-12 noPadding" style="position: relative;">
                        <!-- Map View Selector -->
                        <div class="map-view-selector">
                            <button 
                                :class="['view-btn', { active: mapView === '2d' }]"
                                @click="setMapView('2d')"
                                title="2D Map View">
                                2D
                            </button>
                            <button 
                                :class="['view-btn', { active: mapView === '3d' }]"
                                @click="setMapView('3d')"
                                title="3D Trajectory View">
                                3D
                            </button>
                        </div>
                        
                        <!-- Map Viewers -->
                        <OpenLayersViewer v-show="mapView === '2d'" ref="openLayersViewer"/>
                        <ThreeJSViewer v-show="mapView === '3d'" ref="threeJSViewer"/>
                    </div>
                </div>
            </main>

        </div>
    </div>
</template>

<script>
import isOnline from 'is-online'
import Plotly from '@/components/Plotly.vue'
import OpenLayersViewer from '@/components/OpenLayersViewer.vue'
// Lazy load ThreeJSViewer to avoid import errors if dependencies aren't installed
const ThreeJSViewer = () => import('@/components/ThreeJSViewer.vue')
import Sidebar from '@/components/Sidebar.vue'
import TxInputs from '@/components/widgets/TxInputs.vue'
import ParamViewer from '@/components/widgets/ParamViewer.vue'
import MessageViewer from '@/components/widgets/MessageViewer.vue'
import DeviceIDViewer from '@/components/widgets/DeviceIDViewer.vue'
import AttitudeViewer from '@/components/widgets/AttitudeWidget.vue'
import { store } from '@/components/Globals.js'
import { AtomSpinner } from 'epic-spinners'
import colormap from 'colormap'
import { DataflashDataExtractor } from '../tools/dataflashDataExtractor'
import { MavlinkDataExtractor } from '../tools/mavlinkDataExtractor'
import { DjiDataExtractor } from '../tools/djiDataExtractor'
import MagFitTool from '@/components/widgets/MagFitTool.vue'
import EkfHelperTool from '@/components/widgets/EkfHelperTool.vue'
import Vue from 'vue'

export default {
    name: 'Home',
    created () {
        this.$eventHub.$on('messagesDoneLoading', this.extractFlightData)
        this.state.messages = {}
        this.state.timeAttitude = []
        this.state.timeAttitudeQ = []
        this.state.currentTrajectory = []
        isOnline().then(a => { this.state.isOnline = a })
        
        // Restore preferred map view from localStorage
        const savedMapView = localStorage.getItem('preferredMapView')
        if (savedMapView && ['2d', '3d'].includes(savedMapView)) {
            this.mapView = savedMapView
        }
    },
    beforeDestroy () {
        this.$eventHub.$off('messages')
    },
    data () {
        return {
            state: store,
            dataExtractor: null,
            mapView: '2d' // Default to 2D view, options: '2d', '3d'
        }
    },
    methods: {
        extractFlightData () {
            if (this.dataExtractor === null) {
                if (this.state.logType === 'tlog') {
                    this.dataExtractor = MavlinkDataExtractor
                } else if (this.state.logType === 'dji') {
                    this.dataExtractor = DjiDataExtractor
                } else {
                    this.dataExtractor = DataflashDataExtractor
                }
            }
            if ('FMTU' in this.state.messages && this.state.messages.FMTU.length === 0) {
                this.state.processStatus = 'ERROR PARSING?'
            }

            if (this.state.flightModeChanges.length === 0) {
                this.state.flightModeChanges = this.dataExtractor.extractFlightModes(this.state.messages)
            }
            Vue.delete(this.state.messages, 'MODE')

            if (this.state.events.length === 0) {
                this.state.events = this.dataExtractor.extractEvents(this.state.messages)
            }
            Vue.delete(this.state.messages, 'STAT')
            Vue.delete(this.state.messages, 'EV')

            if (this.state.mission.length === 0) {
                this.state.mission = this.dataExtractor.extractMission(this.state.messages)
            }

            Vue.delete(this.state.messages, 'CMD')

            this.state.vehicle = this.dataExtractor.extractVehicleType(this.state.messages)
            if (this.state.params === undefined) {
                this.state.params = this.dataExtractor.extractParams(this.state.messages)
                if (this.state.params !== undefined) {
                    this.state.defaultParams = this.dataExtractor.extractDefaultParams(this.state.messages)
                    if (this.state.params !== undefined) {
                        this.$eventHub.$on('map-time-changed', (time) => {
                            this.state.params.seek(time)
                        })
                    }
                }
            }
            if (this.state.vehicle === 'quadcopter') {
                if (this.state.params?.get('FRAME_TYPE') === 0) {
                    this.state.vehicle += '+'
                } else {
                    this.state.vehicle += 'x'
                }
            }
            if (this.state.textMessages.length === 0) {
                console.log('Extracting text messages from:', Object.keys(this.state.messages))
                this.state.textMessages = this.dataExtractor.extractTextMessages(this.state.messages)
                console.log('Extracted text messages count:', this.state.textMessages.length)
                console.log('Sample text messages:', this.state.textMessages.slice(0, 3))
            }
            Vue.delete(this.state.messages, 'MSG')

            if (this.state.colors.length === 0) {
                this.generateColorMMap()
            }
            this.state.attitudeSources = this.dataExtractor.extractAttitudeSources(this.state.messages)
            if (this.state.attitudeSources.quaternions.length > 0) {
                const source = this.state.attitudeSources.quaternions[0]
                this.state.attitudeSource = source
                this.state.timeAttitudeQ = this.dataExtractor.extractAttitudeQ(this.state.messages, source)
            } else if (this.state.attitudeSources.eulers.length > 0) {
                const source = this.state.attitudeSources.eulers[0]
                this.state.attitudeSource = source
                this.state.timeAttitude = this.dataExtractor.extractAttitude(this.state.messages, source)
            }

            const list = Object.keys(this.state.timeAttitude)
            this.state.lastTime = parseInt(list[list.length - 1])

            this.state.trajectorySources = this.dataExtractor.extractTrajectorySources(this.state.messages)
            if (this.state.trajectorySources.length > 0) {
                const first = this.state.trajectorySources[0]
                this.state.trajectorySource = first
                this.state.trajectories = this.dataExtractor.extractTrajectory(
                    this.state.messages,
                    first
                )
                try {
                    this.state.currentTrajectory = this.state.trajectories[first].trajectory
                    this.state.timeTrajectory = this.state.trajectories[first].timeTrajectory
                } catch {
                    console.log('unable to load trajectory')
                }
            }
            try {
                if (this.state.messages?.GPS?.time_boot_ms) {
                    this.state.metadata = { startTime: this.dataExtractor.extractStartTime(this.state.messages.GPS) }
                } else {
                    this.state.metadata = {
                        startTime: this.dataExtractor.extractStartTime(this.state.messages['GPS[0]'])
                    }
                }
            } catch (error) {
                console.log('unable to load metadata')
                console.log(error)
            }
            try {
                this.state.namedFloats = this.dataExtractor.extractNamedValueFloatNames(this.state.messages)
                console.log(this.state.namedFloats)
            } catch (error) {
                console.log('unable to load named floats')
                console.log(error)
            }
            Vue.delete(this.state.messages, 'AHR2')
            Vue.delete(this.state.messages, 'POS')
            // Keep GPS messages for timeline usage
            // Vue.delete(this.state.messages, 'GPS')

            this.state.fences = this.dataExtractor.extractFences(this.state.messages)

            this.state.processStatus = 'Processed!'
            this.state.processDone = true
            // Change to plot view after 2 seconds so the Processed status is readable
            setTimeout(() => { this.$eventHub.$emit('set-selected', 'plot') }, 2000)

            // Only set showMap to true if it is available and was previously unavailable
            if (!this.state.mapAvailable) {
                this.state.mapAvailable = this.state.currentTrajectory.length > 0
                if (this.state.mapAvailable) {
                    this.state.showMap = true
                }
            }
        },

        generateColorMMap () {
            const colorMapOptions = {
                colormap: 'hsv',
                nshades: Math.max(11, this.setOfModes.length),
                format: 'rgbaString',
                alpha: 1
            }
            // colormap used on legend.
            this.state.cssColors = colormap(colorMapOptions)

            // colormap used on OpenLayers (simple color objects instead of Cesium.Color)
            colorMapOptions.format = 'float'
            this.state.colors = []
            for (const rgba of colormap(colorMapOptions)) {
                this.state.colors.push({
                    r: rgba[0],
                    g: rgba[1], 
                    b: rgba[2],
                    a: 1.0
                })
            }
        },
        
        setMapView (view) {
            this.mapView = view
            // Store preference in localStorage
            localStorage.setItem('preferredMapView', view)
        }
    },
    components: {
        Sidebar,
        Plotly,
        OpenLayersViewer,
        ThreeJSViewer,
        AtomSpinner,
        TxInputs,
        ParamViewer,
        MessageViewer,
        DeviceIDViewer,
        AttitudeViewer,
        MagFitTool,
        EkfHelperTool
    },
    computed: {
        mapOk () {
            return (this.state.flightModeChanges !== undefined &&
                    this.state.currentTrajectory !== undefined &&
                    this.state.currentTrajectory.length > 0 &&
                    (Object.keys(this.state.timeAttitude).length > 0 ||
                        Object.keys(this.state.timeAttitudeQ).length > 0))
        },
        setOfModes () {
            const set = []
            if (!this.state.flightModeChanges) {
                return []
            }
            for (const mode of this.state.flightModeChanges) {
                if (!set.includes(mode[1])) {
                    set.push(mode[1])
                }
            }
            return set
        }
    }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>

    .nav-side-menu ul :not(collapsed) .arrow:before,
    .nav-side-menu li :not(collapsed) .arrow:before {
        font-family: 'Montserrat', sans-serif;
        content: "\f078";
        display: inline-block;
        padding-left: 10px;
        padding-right: 10px;
        vertical-align: middle;
        float: right;
    }

    body {
        margin: 0;
        padding: 0;
    }

    .container-fluid {
        padding-left: 0;
        padding-right: 0;
    }

    div .col-12 {
        padding-left: 0;
        padding-right: 0;
    }

    i {
        margin: 10px;
    }

    .map-view-selector {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 1000;
        display: flex;
        gap: 6px;
        background: rgba(30, 33, 38, 0.95);
        padding: 6px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
    }

    .view-btn {
        background: linear-gradient(145deg, #3a4556 0%, #2d3748 100%);
        color: #e2e8f0;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 8px 16px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        min-width: 60px;
    }

    .view-btn:hover {
        background: linear-gradient(145deg, #4a5568 0%, #3d4758 100%);
        border-color: rgba(255, 255, 255, 0.2);
        transform: translateY(-1px);
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
    }

    .view-btn.active {
        background: linear-gradient(145deg, #2196F3 0%, #1976D2 100%);
        color: #ffffff;
        border-color: rgba(33, 150, 243, 0.5);
        box-shadow: 0 2px 8px rgba(33, 150, 243, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
    }

    .view-btn.active:hover {
        background: linear-gradient(145deg, #42A5F5 0%, #2196F3 100%);
        box-shadow: 0 4px 12px rgba(33, 150, 243, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15) inset;
    }

    .noPadding {
        padding: 0 !important;
    }

    i .dropdown {
        float: right;
    }

    .noPadding {
        padding-left: 4px;
        padding-right: 6px;
        max-height: 100%;
    }

    div #waiting {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1000;
        display: block;
        background-color: black;
        opacity: 0.75;
        text-align: center;
    }
    /* ATOM SPINNER */

      div .atom-spinner {
        margin: auto;
        margin-top: 15%;
    }

</style>
<style>
a {
    color: #ffffff !important;
}
</style>
