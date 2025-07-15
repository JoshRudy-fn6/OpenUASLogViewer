// OpenLayers Color Coding System
// Port of Cesium color coders

export default class ColorCoderMode {
    requiredMessages = []

    constructor(state) {
        this.state = state
        this.setOfModes = null
    }

    getLegend() {
        const legend = []
        const modes = this.getSetOfModes()
        
        for (const mode of modes) {
            legend.push({
                name: mode,
                color: this.state.cssColors[modes.indexOf(mode)]
            })
        }
        return legend
    }

    getColor(time) {
        const modes = this.getSetOfModes()
        const mode = this.getMode(time)
        const colorIndex = modes.indexOf(mode)
        
        if (colorIndex >= 0 && this.state.colors && this.state.colors[colorIndex]) {
            return this.state.colors[colorIndex]
        }
        
        // Default color if not found
        return { red: 1, green: 0, blue: 0, alpha: 1 }
    }

    getMode(time) {
        if (!this.state.flightModeChanges || this.state.flightModeChanges.length === 0) {
            return 'UNKNOWN'
        }
        
        let previousMode = this.state.flightModeChanges[0][1]
        
        for (const mode of this.state.flightModeChanges) {
            if (mode[0] > time) {
                return previousMode
            }
            previousMode = mode[1]
        }
        
        return this.state.flightModeChanges[this.state.flightModeChanges.length - 1][1]
    }

    getSetOfModes() {
        if (this.setOfModes !== null) {
            return this.setOfModes
        }
        
        const set = []
        
        if (this.state.flightModeChanges) {
            for (const mode of this.state.flightModeChanges) {
                if (!set.includes(mode[1])) {
                    set.push(mode[1])
                }
            }
        }
        
        this.setOfModes = set
        return set
    }
    
    // Convert Cesium Color to CSS color string
    toCssColor(cesiumColor) {
        const r = Math.round(cesiumColor.red * 255)
        const g = Math.round(cesiumColor.green * 255)
        const b = Math.round(cesiumColor.blue * 255)
        const a = cesiumColor.alpha !== undefined ? cesiumColor.alpha : 1
        
        return `rgba(${r}, ${g}, ${b}, ${a})`
    }
    
    // Convert Cesium Color to OpenLayers color array
    toOlColor(cesiumColor) {
        const r = Math.round(cesiumColor.red * 255)
        const g = Math.round(cesiumColor.green * 255)
        const b = Math.round(cesiumColor.blue * 255)
        const a = cesiumColor.alpha !== undefined ? cesiumColor.alpha : 1
        
        return [r, g, b, a]
    }
}
