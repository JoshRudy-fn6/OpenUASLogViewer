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
        console.log('Timeline updateVisualization called with time:', this.currentTime)
        if (this.mapViewer) {
            console.log('Calling mapViewer.showAttitude')
            this.mapViewer.showAttitude(this.currentTime)
        } else {
            console.log('No mapViewer available')
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
        
        // Initialize GPS timestamp display
        this.initializeGPSDisplay()
    }
    
    initializeGPSDisplay() {
        // Set initial GPS timestamp
        if (this.gpsTimestamp && this.timeline.currentTime) {
            const gpsTime = this.getGPSTimeAtBootTime(this.timeline.currentTime)
            if (gpsTime) {
                this.gpsTimestamp.textContent = `GPS Time: ${gpsTime}`
            } else {
                this.gpsTimestamp.textContent = 'Flight Time: 0:00'
            }
        }
    }
    
    refreshGPSDisplay() {
        // Force refresh of GPS timestamp display
        if (this.timeline && this.timeline.currentTime) {
            this.updateTimeIndicator(this.timeline.currentTime)
        }
    }
    
    createElements() {
        this.container.innerHTML = `
            <div class="timeline-widget">
                <div class="timeline-gps-info">
                    <span class="gps-timestamp">GPS Time: Loading...</span>
                </div>
                <div class="timeline-controls">
                    <button class="timeline-btn step-backward">⏮</button>
                    <button class="timeline-btn play-pause-btn">⏵</button>
                    <button class="timeline-btn step-forward">⏭</button>
                    <button class="timeline-btn stop-btn">⏹</button>
                    <span class="time-display">00:00</span>
                    <select class="speed-select">
                        <option value="-10">-10x</option>
                        <option value="-5">-5x</option>
                        <option value="-2">-2x</option>
                        <option value="-1">-1x</option>
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
                    <div class="timeline-mode-segments"></div>
                    <div class="timeline-time-markers"></div>
                    <div class="timeline-progress"></div>
                    <div class="timeline-thumb"></div>
                </div>
            </div>
        `
        
        // Get references to elements
        this.gpsTimestamp = this.container.querySelector('.gps-timestamp')
        this.stepBackwardBtn = this.container.querySelector('.step-backward')
        this.playPauseBtn = this.container.querySelector('.play-pause-btn')
        this.stepForwardBtn = this.container.querySelector('.step-forward')
        this.stopBtn = this.container.querySelector('.stop-btn')
        this.timeDisplay = this.container.querySelector('.time-display')
        this.speedSelect = this.container.querySelector('.speed-select')
        this.track = this.container.querySelector('.timeline-track')
        this.modeSegments = this.container.querySelector('.timeline-mode-segments')
        this.timeMarkers = this.container.querySelector('.timeline-time-markers')
        this.progress = this.container.querySelector('.timeline-progress')
        this.thumb = this.container.querySelector('.timeline-thumb')
    }
    
    setupEventListeners() {
        // Step backward button
        this.stepBackwardBtn.addEventListener('click', () => {
            const stepSize = (this.timeline.endTime - this.timeline.startTime) * 0.01 // 1% step
            this.timeline.setCurrentTime(this.timeline.currentTime - stepSize)
        })

        // Play/Pause button
        this.playPauseBtn.addEventListener('click', () => {
            if (this.timeline.isPlaying) {
                this.timeline.pause()
            } else {
                this.timeline.play()
            }
        })

        // Step forward button
        this.stepForwardBtn.addEventListener('click', () => {
            const stepSize = (this.timeline.endTime - this.timeline.startTime) * 0.01 // 1% step
            this.timeline.setCurrentTime(this.timeline.currentTime + stepSize)
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

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
            
            switch(e.code) {
                case 'Space':
                    e.preventDefault()
                    if (this.timeline.isPlaying) {
                        this.timeline.pause()
                    } else {
                        this.timeline.play()
                    }
                    break
                case 'ArrowLeft':
                    e.preventDefault()
                    const stepBackSize = (this.timeline.endTime - this.timeline.startTime) * 0.01
                    this.timeline.setCurrentTime(this.timeline.currentTime - stepBackSize)
                    break
                case 'ArrowRight':
                    e.preventDefault()
                    const stepForwardSize = (this.timeline.endTime - this.timeline.startTime) * 0.01
                    this.timeline.setCurrentTime(this.timeline.currentTime + stepForwardSize)
                    break
                case 'Home':
                    e.preventDefault()
                    this.timeline.setCurrentTime(this.timeline.startTime)
                    break
                case 'End':
                    e.preventDefault()
                    this.timeline.setCurrentTime(this.timeline.endTime)
                    break
            }
        })
    }
    
    updateTimeFromPosition(event) {
        const rect = this.track.getBoundingClientRect()
        const percentage = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
        const time = this.timeline.percentageToTime(percentage)
        console.log('Timeline clicked - percentage:', percentage, 'time:', time)
        this.timeline.setCurrentTime(time)
    }
    
    updateTimeIndicator(time) {
        const percentage = this.timeline.timeToPercentage(time)
        
        // Update progress bar
        this.progress.style.width = `${percentage * 100}%`
        this.thumb.style.left = `${percentage * 100}%`
        
        // Update time display
        this.timeDisplay.textContent = this.formatTime(time)
        
        // Update GPS timestamp display
        if (this.gpsTimestamp) {
            const gpsTime = this.getGPSTimeAtBootTime(time)
            if (gpsTime) {
                this.gpsTimestamp.textContent = `GPS Time: ${gpsTime}`
            } else {
                // Fallback: show relative time from start
                const relativeMs = time - this.timeline.startTime
                const totalSeconds = Math.floor(relativeMs / 1000)
                const hours = Math.floor(totalSeconds / 3600)
                const minutes = Math.floor((totalSeconds % 3600) / 60)
                const seconds = totalSeconds % 60
                
                let relativeTime = ''
                if (hours > 0) {
                    relativeTime = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
                } else {
                    relativeTime = `${minutes}:${seconds.toString().padStart(2, '0')}`
                }
                
                this.gpsTimestamp.textContent = `Flight Time: +${relativeTime}`
            }
        }
    }
    
    updatePlayButton(isPlaying) {
        this.playPauseBtn.textContent = isPlaying ? '⏸' : '⏵'
    }
    
    formatTime(timeMs, includeGPSTime = false) {
        // Convert from boot time milliseconds to relative time
        const relativeMs = timeMs - this.timeline.startTime
        const totalSeconds = Math.floor(relativeMs / 1000)
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        
        let timeString = ''
        
        // For longer flights, show hours too
        if (minutes >= 60) {
            const hours = Math.floor(minutes / 60)
            const remainingMinutes = minutes % 60
            timeString = `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        } else {
            timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        }
        
        // Try to add GPS timestamp if available
        if (includeGPSTime && this.timeline.mapViewer?.state?.messages?.GPS) {
            const gpsTime = this.getGPSTimeAtBootTime(timeMs)
            if (gpsTime) {
                timeString += `\n${gpsTime}`
            }
        }
        
        return timeString
    }
    
    getGPSTimeAtBootTime(bootTimeMs) {
        try {
            console.log('=== GPS Time Lookup Debug ===')
            console.log('Boot time:', bootTimeMs)
            console.log('Timeline mapViewer available:', !!this.timeline.mapViewer)
            console.log('State available:', !!this.timeline.mapViewer?.state)
            console.log('Messages available:', !!this.timeline.mapViewer?.state?.messages)
            
            if (this.timeline.mapViewer?.state?.messages) {
                console.log('Available message keys:', Object.keys(this.timeline.mapViewer.state.messages))
            }
            
            // Look for GPS data in multiple possible locations
            let gpsMessages = this.timeline.mapViewer?.state?.messages?.GPS
            
            if (!gpsMessages) {
                // Try alternative GPS key formats
                gpsMessages = this.timeline.mapViewer?.state?.messages?.['GPS[0]']
            }
            
            if (!gpsMessages) {
                // Try other possible GPS message types including ArduPilot formats
                for (const key of Object.keys(this.timeline.mapViewer?.state?.messages || {})) {
                    if (key.includes('GPS') || key === 'GLOBAL_POSITION_INT' || key === 'GPS_RAW_INT') {
                        gpsMessages = this.timeline.mapViewer.state.messages[key]
                        console.log('Found GPS data under key:', key)
                        break
                    }
                }
            }
            
            console.log('GPS lookup - bootTimeMs:', bootTimeMs, 'GPS messages available:', !!gpsMessages, 'Count:', gpsMessages?.length)
            
            if (!gpsMessages || gpsMessages.length === 0) {
                console.log('No GPS messages available')
                return null
            }
            
            console.log('Sample GPS message structure:', gpsMessages[0])
            
            // Find GPS message closest to the boot time
            let closestGPS = null
            let closestTimeDiff = Infinity
            
            for (const gps of gpsMessages) {
                const gpsBootTime = gps.time_boot_ms || gps.TimeUS / 1000 || gps.timestamp
                if (gpsBootTime !== undefined) {
                    const timeDiff = Math.abs(gpsBootTime - bootTimeMs)
                    if (timeDiff < closestTimeDiff) {
                        closestTimeDiff = timeDiff
                        closestGPS = gps
                    }
                }
            }
            
            console.log('Closest GPS message:', closestGPS)
            console.log('Time difference from target:', closestTimeDiff, 'ms')
            
            if (closestGPS) {
                console.log('Closest GPS message fields:', Object.keys(closestGPS))
                console.log('GPS message sample:', closestGPS)
                
                // Try different GPS timestamp formats
                if (closestGPS.time_week !== undefined && closestGPS.time_week_ms !== undefined) {
                    // GPS week format (MAVLink GPS_RAW_INT)
                    const gpsEpoch = new Date('1980-01-06T00:00:00Z').getTime()
                    const utcTime = gpsEpoch + (closestGPS.time_week * 7 * 24 * 60 * 60 * 1000) + closestGPS.time_week_ms
                    
                    const date = new Date(utcTime)
                    console.log('Calculated GPS time from week/ms:', date)
                    return date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short'
                    })
                } else if (closestGPS.time_unix_usec) {
                    // Unix timestamp in microseconds (MAVLink GPS messages)
                    const date = new Date(closestGPS.time_unix_usec / 1000)
                    console.log('Calculated GPS time from unix usec:', date)
                    return date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short'
                    })
                } else if (closestGPS.GWk !== undefined && closestGPS.GMS !== undefined) {
                    // ArduPilot GPS week format (.bin format)
                    console.log('Using ArduPilot GPS format - GWk:', closestGPS.GWk, 'GMS:', closestGPS.GMS)
                    
                    // Validate GPS week and milliseconds
                    if (closestGPS.GWk > 1000 && closestGPS.GWk < 10000 && closestGPS.GMS >= 0 && closestGPS.GMS < 604800000) {
                        const gpsEpoch = new Date('1980-01-06T00:00:00Z').getTime()
                        const utcTime = gpsEpoch + (closestGPS.GWk * 7 * 24 * 60 * 60 * 1000) + closestGPS.GMS
                        
                        const date = new Date(utcTime)
                        console.log('Calculated GPS time from ArduPilot GWk/GMS:', date)
                        
                        // Check if the calculated date is reasonable (not too far in past/future)
                        const now = new Date()
                        const yearsDiff = Math.abs(now.getFullYear() - date.getFullYear())
                        
                        if (yearsDiff < 50) { // Reasonable range
                            return date.toLocaleString('en-US', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                timeZoneName: 'short'
                            })
                        } else {
                            console.log('Calculated GPS date seems unreasonable:', date, 'years diff:', yearsDiff)
                        }
                    } else {
                        console.log('GPS week/ms values seem invalid - GWk:', closestGPS.GWk, 'GMS:', closestGPS.GMS)
                    }
                } else if (closestGPS.T) {
                    // ArduPilot timestamp format (nanoseconds since GPS epoch)
                    const gpsEpoch = new Date('1980-01-06T00:00:00Z').getTime()
                    const utcTime = gpsEpoch + (closestGPS.T / 1000000)  // Convert nanoseconds to milliseconds
                    
                    const date = new Date(utcTime)
                    console.log('Calculated GPS time from T (nanoseconds):', date)
                    return date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short'
                    })
                } else if (closestGPS.timeUS) {
                    // Alternative timestamp format in microseconds 
                    const date = new Date(closestGPS.timeUS / 1000)
                    console.log('Calculated GPS time from timeUS:', date)
                    return date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short'
                    })
                } else {
                    console.log('GPS message lacks recognizable time fields')
                    console.log('Available GPS fields:', Object.keys(closestGPS))
                    
                    // Fallback: show boot time relative to first GPS message
                    const firstGPS = gpsMessages[0]
                    const firstBootTime = firstGPS.time_boot_ms || firstGPS.TimeUS / 1000 || firstGPS.timestamp
                    if (firstBootTime !== undefined) {
                        const relativeSeconds = Math.floor((bootTimeMs - firstBootTime) / 1000)
                        const minutes = Math.floor(relativeSeconds / 60)
                        const seconds = relativeSeconds % 60
                        return `Boot+${minutes}:${seconds.toString().padStart(2, '0')}`
                    }
                }
            }
        } catch (error) {
            console.warn('Error getting GPS time:', error)
        }
        
        return null
    }
    
    setModeSegments(segments) {
        // Clear existing segments
        this.modeSegments.innerHTML = ''
        
        // Add mode segments
        segments.forEach(segment => {
            const segmentDiv = document.createElement('div')
            segmentDiv.className = 'mode-segment'
            segmentDiv.style.cssText = `
                position: absolute;
                left: ${segment.start * 100}%;
                width: ${(segment.end - segment.start) * 100}%;
                height: 100%;
                background-color: ${segment.color};
                opacity: 0.7;
                border-radius: 10px;
            `
            segmentDiv.title = `${segment.mode} (${(segment.start * 100).toFixed(1)}% - ${(segment.end * 100).toFixed(1)}%)`
            this.modeSegments.appendChild(segmentDiv)
        })
        
        // Create time markers
        this.createTimeMarkers()
    }

    createTimeMarkers() {
        // Clear existing markers
        this.timeMarkers.innerHTML = ''
        
        const duration = this.timeline.endTime - this.timeline.startTime
        const startTime = this.timeline.startTime
        
        console.log('Creating time markers - Duration:', duration, 'Start:', startTime, 'End:', this.timeline.endTime)
        
        if (duration <= 0) {
            console.warn('Invalid duration for time markers:', duration)
            return
        }
        
        // Create major markers every 10% with labels
        const majorMarkerCount = 11 // 0%, 10%, 20%, ..., 100%
        
        for (let i = 0; i < majorMarkerCount; i++) {
            const percentage = i / (majorMarkerCount - 1)
            const timeAtMarker = startTime + (duration * percentage)
            
            const markerDiv = document.createElement('div')
            markerDiv.className = 'time-marker major-marker'
            markerDiv.style.cssText = `
                position: absolute;
                left: ${percentage * 100}%;
                top: -2px;
                transform: translateX(-50%);
                font-size: 10px;
                color: #fff;
                white-space: nowrap;
                pointer-events: auto;
                z-index: 25;
                background: rgba(0,0,0,0.8);
                padding: 1px 3px;
                border-radius: 2px;
                border: 1px solid #555;
                text-shadow: 1px 1px 1px rgba(0,0,0,0.8);
                cursor: pointer;
            `
            markerDiv.textContent = this.formatTime(timeAtMarker)
            
            // Add detailed tooltip on hover
            const gpsTime = this.getGPSTimeAtBootTime(timeAtMarker)
            const tooltipText = gpsTime ? 
                `Flight Time: ${this.formatTime(timeAtMarker)}\nGPS Time: ${gpsTime}` :
                `Flight Time: ${this.formatTime(timeAtMarker)}\nBoot Time: ${timeAtMarker}ms`
            markerDiv.title = tooltipText
            
            // Add click to jump to time
            markerDiv.addEventListener('click', (e) => {
                e.stopPropagation()
                this.timeline.setCurrentTime(timeAtMarker)
            })
            
            // Add major tick mark
            const tickDiv = document.createElement('div')
            tickDiv.className = 'time-tick major-tick'
            tickDiv.style.cssText = `
                position: absolute;
                left: ${percentage * 100}%;
                top: 0;
                width: 2px;
                height: 20px;
                background-color: #fff;
                transform: translateX(-50%);
                pointer-events: none;
                z-index: 20;
                box-shadow: 0 0 2px rgba(0,0,0,0.5);
            `
            
            this.timeMarkers.appendChild(markerDiv)
            this.timeMarkers.appendChild(tickDiv)
        }
        
        // Create minor tick marks every 5% without labels
        const minorMarkerCount = 21 // Every 5%
        for (let i = 0; i < minorMarkerCount; i++) {
            const percentage = i / (minorMarkerCount - 1)
            
            // Skip major marker positions
            if (percentage * 10 % 1 === 0) continue
            
            const minorTickDiv = document.createElement('div')
            minorTickDiv.className = 'time-tick minor-tick'
            minorTickDiv.style.cssText = `
                position: absolute;
                left: ${percentage * 100}%;
                top: 5px;
                width: 1px;
                height: 10px;
                background-color: #ccc;
                transform: translateX(-50%);
                pointer-events: none;
                z-index: 15;
                opacity: 0.6;
            `
            
            this.timeMarkers.appendChild(minorTickDiv)
        }
        
        // Create micro tick marks every 2.5% (very small)
        const microMarkerCount = 41 // Every 2.5%
        for (let i = 0; i < microMarkerCount; i++) {
            const percentage = i / (microMarkerCount - 1)
            
            // Skip major and minor marker positions
            if (percentage * 20 % 2 === 0) continue
            
            const microTickDiv = document.createElement('div')
            microTickDiv.className = 'time-tick micro-tick'
            microTickDiv.style.cssText = `
                position: absolute;
                left: ${percentage * 100}%;
                top: 10px;
                width: 1px;
                height: 5px;
                background-color: #999;
                transform: translateX(-50%);
                pointer-events: none;
                z-index: 10;
                opacity: 0.4;
            `
            
            this.timeMarkers.appendChild(microTickDiv)
        }
        
        console.log('Time markers created:', this.timeMarkers.children.length)
        console.log('Timeline container dimensions:', this.timeMarkers.parentElement?.getBoundingClientRect())
    }
}
