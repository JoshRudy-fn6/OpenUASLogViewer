<template>
    <div class="openlayers-settings">
        <div class="settings-section">
            <label class="setting-label">Base Layer:</label>
            <select v-model="selectedBaseLayer" @change="changeBaseLayer" class="setting-select">
                <option v-for="provider in imageryProviders" :key="provider.name" :value="provider.name">
                    {{ provider.name }}
                </option>
            </select>
        </div>
        
        <div class="settings-section">
            <label class="setting-label">Show Trajectory:</label>
            <input type="checkbox" v-model="showTrajectory" @change="toggleTrajectory" />
        </div>
        
        <div class="settings-section">
            <label class="setting-label">Show Waypoints:</label>
            <input type="checkbox" v-model="showWaypoints" @change="toggleWaypoints" />
        </div>
        
        <div class="settings-section">
            <label class="setting-label">Show Vehicle:</label>
            <input type="checkbox" v-model="showVehicle" @change="toggleVehicle" />
        </div>
        
        <div class="settings-section">
            <label class="setting-label">Trajectory Style:</label>
            <select v-model="trajectoryStyle" @change="changeTrajectoryStyle" class="setting-select">
                <option value="line">Line</option>
                <option value="points">Points</option>
                <option value="both">Both</option>
            </select>
        </div>
    </div>
</template>

<script>
import { IMAGERY_PROVIDERS } from '../../config/openlayers.js'

export default {
    name: 'OpenLayersSettingsWidget',
    
    data() {
        return {
            selectedBaseLayer: 'OpenStreetMap',
            showTrajectory: true,
            showWaypoints: true,
            showVehicle: true,
            trajectoryStyle: 'both',
            imageryProviders: IMAGERY_PROVIDERS
        }
    },
    
    methods: {
        changeBaseLayer() {
            this.$emit('base-layer-changed', this.selectedBaseLayer)
        },
        
        toggleTrajectory() {
            this.$emit('trajectory-visibility-changed', this.showTrajectory)
        },
        
        toggleWaypoints() {
            this.$emit('waypoints-visibility-changed', this.showWaypoints)
        },
        
        toggleVehicle() {
            this.$emit('vehicle-visibility-changed', this.showVehicle)
        },
        
        changeTrajectoryStyle() {
            this.$emit('trajectory-style-changed', this.trajectoryStyle)
        }
    }
}
</script>

<style scoped>
.openlayers-settings {
    background: rgba(42, 42, 42, 0.9);
    padding: 10px;
    border-radius: 5px;
    min-width: 200px;
    margin-top: 10px;
}

.settings-section {
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.setting-label {
    color: white;
    font-size: 12px;
    margin-right: 8px;
    flex: 1;
}

.setting-select {
    background: #2a2a2a;
    color: white;
    border: 1px solid #555;
    border-radius: 3px;
    padding: 2px 4px;
    font-size: 11px;
    max-width: 100px;
}

input[type="checkbox"] {
    margin: 0;
}
</style>
