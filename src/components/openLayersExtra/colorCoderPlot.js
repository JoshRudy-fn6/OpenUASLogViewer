// OpenLayers Plot-based Color Coding

export default class ColorCoderPlot {
    requiredMessages = []

    constructor(state) {
        this.state = state
        this.plotField = 'Vcc' // Default field
        this.colorScale = 'viridis' // Color scale type
    }

    setPlotField(field) {
        this.plotField = field
    }

    setColorScale(scale) {
        this.colorScale = scale
    }

    getLegend() {
        const legend = []
        const { min, max } = this.getValueRange()
        const steps = 6
        
        for (let i = 0; i < steps; i++) {
            const value = min + (max - min) * (i / (steps - 1))
            const color = this.getColorForValue(value)
            
            legend.push({
                name: `${value.toFixed(2)}`,
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
        if (!this.state.messages || !this.state.messages[this.plotField]) {
            return 0
        }
        
        const data = this.state.messages[this.plotField]
        if (!data.time_boot_ms || !data[this.plotField]) {
            return 0
        }
        
        // Linear interpolation between closest points
        let lowerIndex = 0
        let upperIndex = data.time_boot_ms.length - 1
        
        // Find bounding indices
        for (let i = 0; i < data.time_boot_ms.length - 1; i++) {
            if (data.time_boot_ms[i] <= time && data.time_boot_ms[i + 1] >= time) {
                lowerIndex = i
                upperIndex = i + 1
                break
            }
        }
        
        const lowerTime = data.time_boot_ms[lowerIndex]
        const upperTime = data.time_boot_ms[upperIndex]
        const lowerValue = data[this.plotField][lowerIndex]
        const upperValue = data[this.plotField][upperIndex]
        
        if (lowerTime === upperTime) {
            return lowerValue
        }
        
        // Linear interpolation
        const ratio = (time - lowerTime) / (upperTime - lowerTime)
        return lowerValue + ratio * (upperValue - lowerValue)
    }

    getValueRange() {
        if (!this.state.messages || !this.state.messages[this.plotField]) {
            return { min: 0, max: 1 }
        }
        
        const data = this.state.messages[this.plotField]
        if (!data[this.plotField]) {
            return { min: 0, max: 1 }
        }
        
        const values = data[this.plotField]
        const min = Math.min(...values)
        const max = Math.max(...values)
        
        return { min, max }
    }

    getColorForValue(value) {
        const { min, max } = this.getValueRange()
        
        if (max === min) {
            return { red: 0.5, green: 0.5, blue: 0.5 }
        }
        
        // Normalize value to 0-1 range
        const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)))
        
        // Apply color scale
        return this.applyColorScale(normalized)
    }

    applyColorScale(normalized) {
        switch (this.colorScale) {
            case 'viridis':
                return this.viridisScale(normalized)
            case 'plasma':
                return this.plasmaScale(normalized)
            case 'inferno':
                return this.infernoScale(normalized)
            case 'magma':
                return this.magmaScale(normalized)
            case 'rainbow':
                return this.rainbowScale(normalized)
            default:
                return this.viridisScale(normalized)
        }
    }

    viridisScale(t) {
        // Viridis color scale approximation
        const r = 0.267004 + t * (0.105782 + t * (0.330245 + t * (-0.264733 + t * 0.262138)))
        const g = 0.004874 + t * (0.967142 + t * (-0.334618 + t * (-0.077478 + t * 0.206823)))
        const b = 0.329415 + t * (0.224929 + t * (0.637053 + t * (-0.365169 + t * (-0.042914))))
        
        return { red: r, green: g, blue: b }
    }

    plasmaScale(t) {
        // Plasma color scale approximation
        const r = 0.050383 + t * (1.026837 + t * (-0.348587 + t * (-0.218740 + t * 0.316423)))
        const g = 0.029803 + t * (0.306771 + t * (1.219754 + t * (-0.662145 + t * (-0.179851))))
        const b = 0.579710 + t * (0.054534 + t * (-0.551667 + t * (0.778630 + t * (-0.334251))))
        
        return { red: r, green: g, blue: b }
    }

    rainbowScale(t) {
        // Simple rainbow color scale
        const hue = t * 300 // 0 to 300 degrees (purple to red)
        return this.hslToRgb(hue / 360, 1, 0.5)
    }

    hslToRgb(h, s, l) {
        let r, g, b
        
        if (s === 0) {
            r = g = b = l // achromatic
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1
                if (t > 1) t -= 1
                if (t < 1/6) return p + (q - p) * 6 * t
                if (t < 1/2) return q
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
                return p
            }
            
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s
            const p = 2 * l - q
            r = hue2rgb(p, q, h + 1/3)
            g = hue2rgb(p, q, h)
            b = hue2rgb(p, q, h - 1/3)
        }
        
        return { red: r, green: g, blue: b }
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
