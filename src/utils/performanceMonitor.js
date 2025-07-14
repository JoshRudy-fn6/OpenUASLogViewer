// Performance monitoring utility for OpenUAS Log Viewer

class PerformanceMonitor {
    constructor () {
        this.timings = new Map()
        this.enabled = process.env.NODE_ENV === 'development'
    }

    start (label) {
        if (!this.enabled) return
        this.timings.set(label, performance.now())
    }

    end (label) {
        if (!this.enabled) return
        const startTime = this.timings.get(label)
        if (startTime) {
            const duration = performance.now() - startTime
            console.log(`🔄 ${label}: ${duration.toFixed(2)}ms`)
            this.timings.delete(label)
            return duration
        }
    }

    memory () {
        if (!this.enabled || !performance.memory) return
        const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory
        console.log(`💾 Memory Usage:
            Used: ${(usedJSHeapSize / 1024 / 1024).toFixed(2)} MB
            Total: ${(totalJSHeapSize / 1024 / 1024).toFixed(2)} MB
            Limit: ${(jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`)
    }

    logFileSize (filename, size) {
        if (!this.enabled) return
        console.log(`📁 File: ${filename} - Size: ${(size / 1024 / 1024).toFixed(2)} MB`)
    }

    logDatasetSize (label, dataLength) {
        if (!this.enabled) return
        console.log(`📊 Dataset ${label}: ${dataLength.toLocaleString()} records`)
    }
}

export const perfMonitor = new PerformanceMonitor()
