// Performance monitoring utility for tracking file processing and application performance

class PerformanceMonitor {
  constructor() {
    this.timers = new Map()
    this.metrics = new Map()
    this.enabled = process.env.NODE_ENV === 'development'
  }

  /**
   * Start timing an operation
   * @param {string} name - Name of the operation to time
   */
  start(name) {
    if (!this.enabled) return
    
    this.timers.set(name, {
      startTime: performance.now(),
      startMemory: this.getMemoryUsage()
    })
    
    console.log(`⏱️ [PerfMonitor] Started timing: ${name}`)
  }

  /**
   * End timing an operation and log results
   * @param {string} name - Name of the operation to stop timing
   */
  end(name) {
    if (!this.enabled) return
    
    const timer = this.timers.get(name)
    if (!timer) {
      console.warn(`⚠️ [PerfMonitor] No timer found for: ${name}`)
      return
    }

    const endTime = performance.now()
    const duration = endTime - timer.startTime
    const endMemory = this.getMemoryUsage()
    const memoryDelta = endMemory - timer.startMemory

    const metric = {
      duration: duration,
      memoryDelta: memoryDelta,
      timestamp: new Date().toISOString()
    }

    this.metrics.set(name, metric)
    this.timers.delete(name)

    console.log(`✅ [PerfMonitor] ${name}: ${duration.toFixed(2)}ms, Memory: ${this.formatBytes(memoryDelta)}`)
    
    return metric
  }

  /**
   * Log file processing information
   * @param {string} filename - Name of the file being processed
   * @param {number} fileSize - Size of the file in bytes
   */
  logFileSize(filename, fileSize) {
    if (!this.enabled) return
    
    console.log(`📁 [PerfMonitor] Processing file: ${filename} (${this.formatBytes(fileSize)})`)
    
    // Store file info for analysis
    this.metrics.set('lastFile', {
      filename,
      fileSize,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Log custom metric
   * @param {string} name - Name of the metric
   * @param {any} value - Value to log
   */
  logMetric(name, value) {
    if (!this.enabled) return
    
    console.log(`📊 [PerfMonitor] ${name}:`, value)
    this.metrics.set(name, {
      value,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Get current memory usage
   * @returns {number} Memory usage in bytes
   */
  getMemoryUsage() {
    if (performance.memory) {
      return performance.memory.usedJSHeapSize
    }
    return 0
  }

  /**
   * Format bytes into human readable format
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * Get all recorded metrics
   * @returns {Object} All metrics data
   */
  getMetrics() {
    const metricsObj = {}
    this.metrics.forEach((value, key) => {
      metricsObj[key] = value
    })
    return metricsObj
  }

  /**
   * Clear all metrics and timers
   */
  clear() {
    this.timers.clear()
    this.metrics.clear()
    console.log('🧹 [PerfMonitor] Cleared all metrics')
  }

  /**
   * Enable or disable performance monitoring
   * @param {boolean} enabled - Whether to enable monitoring
   */
  setEnabled(enabled) {
    this.enabled = enabled
    console.log(`🔧 [PerfMonitor] ${enabled ? 'Enabled' : 'Disabled'}`)
  }
}

// Create singleton instance
export const perfMonitor = new PerformanceMonitor()

// Export class for testing
export { PerformanceMonitor }

// Export default
export default perfMonitor
