// OpenLayers Timeline Integration
// Replaces Cesium's Clock and Timeline system

export class OpenLayersTimeline {
    constructor(mapViewer, options = {}) {
        this.mapViewer = mapViewer
        this.isPlaying = false
        this.currentTime = 0
        this.startTime = 0
        this.endTime = 0
        this.playbackSpeed = 1
        this.animationFrame = null
        
        // Configuration
        this.options = {
            updateInterval: 50, // milliseconds
            autoLoop: true,
            ...options
        }
        
        // Event callbacks
        this.onTimeChanged = null
        this.onPlayStateChanged = null
        
        this.lastUpdateTime = 0
    }
    
    setTimeRange(startTime, endTime) {
        this.startTime = startTime
        this.endTime = endTime
        this.currentTime = startTime
    }
    
    setCurrentTime(time) {
        this.currentTime = Math.max(this.startTime, Math.min(this.endTime, time))
        this.updateVisualization()
        
        if (this.onTimeChanged) {
            this.onTimeChanged(this.currentTime)
        }
    }
    
    play() {
        if (this.isPlaying) return
        
        this.isPlaying = true
        this.lastUpdateTime = performance.now()
        this.animate()
        
        if (this.onPlayStateChanged) {
            this.onPlayStateChanged(true)
        }
    }
    
    pause() {
        this.isPlaying = false
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame)
            this.animationFrame = null
        }
        
        if (this.onPlayStateChanged) {
            this.onPlayStateChanged(false)
        }
    }
    
    stop() {
        this.pause()
        this.currentTime = this.startTime
        this.updateVisualization()
    }
    
    setPlaybackSpeed(speed) {
        this.playbackSpeed = speed
    }
    
    animate() {
        if (!this.isPlaying) return
        
        const now = performance.now()
        const deltaTime = now - this.lastUpdateTime
        
        if (deltaTime >= this.options.updateInterval) {
            // Calculate time progression based on playback speed
            const timeProgress = deltaTime * this.playbackSpeed
            this.currentTime += timeProgress
            
            // Handle looping
            if (this.currentTime > this.endTime) {
                if (this.options.autoLoop) {
                    this.currentTime = this.startTime
                } else {
                    this.pause()
                    return
                }
            }
            
            this.updateVisualization()
            
            if (this.onTimeChanged) {
                this.onTimeChanged(this.currentTime)
            }
            
            this.lastUpdateTime = now
        }
        
        this.animationFrame = requestAnimationFrame(() => this.animate())
    }
    
    updateVisualization() {
        // Update map visualization based on current time
        if (this.mapViewer) {
            this.mapViewer.showAttitude(this.currentTime)
        }
    }
    
    // Convert between time formats
    timeToPercentage(time) {
        if (this.endTime === this.startTime) return 0
        return (time - this.startTime) / (this.endTime - this.startTime)
    }
    
    percentageToTime(percentage) {
        return this.startTime + (percentage * (this.endTime - this.startTime))
    }
    
    destroy() {
        this.pause()
        this.mapViewer = null
        this.onTimeChanged = null
        this.onPlayStateChanged = null
    }
}

// Timeline UI Component
export class TimelineWidget {
    constructor(container, timeline) {
        this.container = container
        this.timeline = timeline
        this.isDragging = false
        
        this.createElements()
        this.setupEventListeners()
        
        // Listen to timeline events
        this.timeline.onTimeChanged = (time) => this.updateTimeIndicator(time)
        this.timeline.onPlayStateChanged = (isPlaying) => this.updatePlayButton(isPlaying)
    }
    
    createElements() {
        this.container.innerHTML = `
            <div class="timeline-widget">
                <div class="timeline-controls">
                    <button class="timeline-btn play-pause-btn">⏵</button>
                    <button class="timeline-btn stop-btn">⏹</button>
                    <span class="time-display">00:00</span>
                    <select class="speed-select">
                        <option value="0.1">0.1x</option>
                        <option value="0.5">0.5x</option>
                        <option value="1" selected>1x</option>
                        <option value="2">2x</option>
                        <option value="5">5x</option>
                        <option value="10">10x</option>
                    </select>
                </div>
                <div class="timeline-track">
                    <div class="timeline-background"></div>
                    <div class="timeline-progress"></div>
                    <div class="timeline-thumb"></div>
                </div>
            </div>
        `
        
        // Get references to elements
        this.playPauseBtn = this.container.querySelector('.play-pause-btn')
        this.stopBtn = this.container.querySelector('.stop-btn')
        this.timeDisplay = this.container.querySelector('.time-display')
        this.speedSelect = this.container.querySelector('.speed-select')
        this.track = this.container.querySelector('.timeline-track')
        this.progress = this.container.querySelector('.timeline-progress')
        this.thumb = this.container.querySelector('.timeline-thumb')
    }
    
    setupEventListeners() {
        // Play/Pause button
        this.playPauseBtn.addEventListener('click', () => {
            if (this.timeline.isPlaying) {
                this.timeline.pause()
            } else {
                this.timeline.play()
            }
        })
        
        // Stop button
        this.stopBtn.addEventListener('click', () => {
            this.timeline.stop()
        })
        
        // Speed selection
        this.speedSelect.addEventListener('change', (e) => {
            this.timeline.setPlaybackSpeed(parseFloat(e.target.value))
        })
        
        // Timeline track interaction
        this.track.addEventListener('mousedown', (e) => {
            this.isDragging = true
            this.updateTimeFromPosition(e)
        })
        
        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.updateTimeFromPosition(e)
            }
        })
        
        document.addEventListener('mouseup', () => {
            this.isDragging = false
        })
    }
    
    updateTimeFromPosition(event) {
        const rect = this.track.getBoundingClientRect()
        const percentage = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
        const time = this.timeline.percentageToTime(percentage)
        this.timeline.setCurrentTime(time)
    }
    
    updateTimeIndicator(time) {
        const percentage = this.timeline.timeToPercentage(time)
        
        // Update progress bar
        this.progress.style.width = `${percentage * 100}%`
        this.thumb.style.left = `${percentage * 100}%`
        
        // Update time display
        this.timeDisplay.textContent = this.formatTime(time)
    }
    
    updatePlayButton(isPlaying) {
        this.playPauseBtn.textContent = isPlaying ? '⏸' : '⏵'
    }
    
    formatTime(timeMs) {
        const seconds = Math.floor(timeMs / 1000)
        const minutes = Math.floor(seconds / 60)
        const remainingSeconds = seconds % 60
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
    }
}
