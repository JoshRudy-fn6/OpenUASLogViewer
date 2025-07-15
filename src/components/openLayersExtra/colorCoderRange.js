// OpenLayers Range-based Color Coding

export default class ColorCoderRange {
    requiredMessages = []

    constructor(state) {
        this.state = state
        this.minValue = null
        this.maxValue = null
        this.dataField = 'Alt' // Default to altitude
    }

    setDataField(field) {
        this.dataField = field
        this.minValue = null
        this.maxValue = null
    }

    getLegend() {
        const legend = []
        const { min, max } = this.getValueRange()
        const steps = 5
        
        for (let i = 0; i <= steps; i++) {
            const value = min + (max - min) * (i / steps)
            const color = this.getColorForValue(value)
            
            legend.push({
                name: `${value.toFixed(1)}`,
                color: this.toCssColor(color)
            })
        }
        
        return legend
    }

    getColor(time) {
        const value = this.getValueAtTime(time)
        return this.getColorForValue(value)
    }

    getValueAtTime(time) {
        // Find the closest data point to the given time
        if (!this.state.messages || !this.state.messages[this.dataField]) {
            return 0
        }
        
        const data = this.state.messages[this.dataField]
        if (!data.time_boot_ms || !data[this.dataField]) {
            return 0
        }
        
        let closestIndex = 0
        let minTimeDiff = Math.abs(data.time_boot_ms[0] - time)
        
        for (let i = 1; i < data.time_boot_ms.length; i++) {
            const timeDiff = Math.abs(data.time_boot_ms[i] - time)
            if (timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff
                closestIndex = i
            }
        }
        
        return data[this.dataField][closestIndex] || 0
    }

    getValueRange() {
        if (this.minValue !== null && this.maxValue !== null) {
            return { min: this.minValue, max: this.maxValue }
        }
        
        if (!this.state.messages || !this.state.messages[this.dataField]) {
            return { min: 0, max: 100 }
        }
        
        const data = this.state.messages[this.dataField]
        if (!data[this.dataField]) {
            return { min: 0, max: 100 }
        }
        
        const values = data[this.dataField]
        this.minValue = Math.min(...values)
        this.maxValue = Math.max(...values)
        
        return { min: this.minValue, max: this.maxValue }
    }

    getColorForValue(value) {
        const { min, max } = this.getValueRange()
        
        if (max === min) {
            return { red: 0.5, green: 0.5, blue: 0.5, alpha: 1 }
        }
        
        // Normalize value to 0-1 range
        const normalized = (value - min) / (max - min)
        
        // Create a color gradient from blue (low) to red (high)
        const red = normalized
        const green = 1 - Math.abs(2 * normalized - 1) // Peak at 0.5
        const blue = 1 - normalized
        
        return { red, green, blue, alpha: 1 }
    }

    // Convert to CSS color string
    toCssColor(color) {
        const r = Math.round(color.red * 255)
        const g = Math.round(color.green * 255)
        const b = Math.round(color.blue * 255)
        
        return `rgb(${r}, ${g}, ${b})`
    }

    // Convert to OpenLayers color array
    toOlColor(color) {
        const r = Math.round(color.red * 255)
        const g = Math.round(color.green * 255)
        const b = Math.round(color.blue * 255)
        
        return [r, g, b, 1]
    }
}
