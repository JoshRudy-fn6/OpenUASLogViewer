<template>
    <div :id="getDivName()"
         v-bind:style="{width:  width + 'px', height: height + 'px', top: top + 'px', left: left + 'px' }">
        <div id="paneContent">
          <span style="float: right; margin: 3px; cursor: pointer;" @click="close()"> X </span>
          <div class="message-header" style="padding: 4px 16px; font-size: 10px; color: #888; border-bottom: 1px solid #ddd;">
              Messages ({{timeFormatter(cursorTime)}} ±{{Math.round(timeWindow/1000)}}s)
          </div>
          <div v-if="filteredData.length === 0" style="padding: 16px; color: #666; font-style: italic; font-size: 11px;">
              <div v-if="state.textMessages.length === 0">
                  No text messages found in log file.
              </div>
              <div v-else>
                  No messages in current time window.
                  <br><small>Scrub timeline to see messages as they occur.</small>
              </div>
          </div>
          <ul v-else>
              <li v-bind:key="msg[0]+msg[1]" v-for="msg in filteredData" 
                  class="message-item"
                  :class="{ 'recent-message': isRecentMessage(msg[0]) }">
                  <span class="message-time">[{{timeFormatter(msg[0])}}]</span>: 
                  <span class="message-text">{{ msg[2] }}</span>
              </li>
          </ul>
        </div>
    </div>
</template>

<script>
import { store } from '../Globals.js'
import { baseWidget } from './baseWidget'
import { formatBootTime } from '../../utils/timeFormatter.js'

export default {
    name: 'MessageViewer',
    mixins: [baseWidget],
    created () {
        this.$eventHub.$on('cesium-time-changed', this.setTime)
        this.$eventHub.$on('hoveredTime', this.setTime)
        // Add support for OpenLayers timeline events
        this.$eventHub.$on('map-time-changed', this.setTime)
        this.$eventHub.$on('timeline-time-changed', this.setTime)
    },
    mounted () {
        // Initialize the component when mounted
        console.log('MessageViewer mounted')
        this.refreshMessages()
        
        // Try to get current time from timeline if available
        setTimeout(() => {
            if (this.state.timeline && this.state.timeline.currentTime) {
                console.log('MessageViewer getting initial time from timeline:', this.state.timeline.currentTime)
                this.setTime(this.state.timeline.currentTime)
            }
        }, 500)
    },
    data () {
        return {
            name: 'MessageViewer',
            filter: '',
            state: store,
            width: 220,
            height: 215,
            left: 310,
            top: 0,
            forceRecompute: 0,
            cursorTime: 0, // Start at beginning of timeline
            timeWindow: 30000, // 30 second window for message display (increased for debugging)
            lastMessageTime: 0 // Track last message time for debugging
        }
    },
    methods: {
        timeFormatter (milliseconds) {
            // Use centralized time formatter for consistency
            return formatBootTime(milliseconds)
        },
        setTime (time) {
            console.log('MessageViewer setTime called with:', time, 'current cursorTime:', this.cursorTime)
            this.cursorTime = time
            // Force reactivity update
            this.forceRecompute += 1
            
            // Debug: Log message filtering results immediately
            if (this.state.textMessages.length > 0) {
                const windowStart = time - this.timeWindow
                const windowEnd = time
                const messagesInWindow = this.state.textMessages.filter(msg => {
                    return msg[0] >= windowStart && msg[0] <= windowEnd
                })
                console.log('MessageViewer time update:', {
                    newTime: time,
                    timeWindow: this.timeWindow,
                    windowRange: `${windowStart} - ${windowEnd}`,
                    totalMessages: this.state.textMessages.length,
                    messagesInWindow: messagesInWindow.length,
                    sampleMessages: messagesInWindow.slice(0, 3).map(m => ({ time: m[0], text: m[2] }))
                })
            }
        },
        waitForMessage (fieldname) {
            this.$eventHub.$emit('loadType', fieldname.split('.')[0])
            let interval
            const _this = this
            let counter = 0
            return new Promise((resolve, reject) => {
                interval = setInterval(function () {
                    if (_this.state.messages[fieldname.split('.')[0]]) {
                        clearInterval(interval)
                        counter += 1
                        resolve()
                    } else {
                        if (counter > 6) {
                            console.log('not resolving')
                            clearInterval(interval)
                            reject(new Error('Could not load messageType'))
                        }
                    }
                }, 2000)
            })
        },
        setup () {
            // Force refresh of messages when component is set up
            this.refreshMessages()
        },
        refreshMessages () {
            console.log('Refreshing messages in MessageViewer')
            this.forceRecompute += 1
            this.$nextTick(() => {
                if (this.state.textMessages.length === 0) {
                    console.log('No text messages available, try re-extracting...')
                    // Force re-extraction if no messages are available
                    if (this.state.messages && window.dataExtractor) {
                        this.state.textMessages = window.dataExtractor.extractTextMessages(this.state.messages)
                        console.log('Re-extracted text messages:', this.state.textMessages.length)
                    }
                } else {
                    // Debug: Show message time range and sample
                    const times = this.state.textMessages.map(m => m[0]).sort((a, b) => a - b)
                    console.log('MessageViewer: Available text messages:', {
                        count: this.state.textMessages.length,
                        timeRange: times.length > 0 ? `${times[0]} - ${times[times.length - 1]}` : 'none',
                        firstMessage: this.state.textMessages[0],
                        sampleTimes: times.slice(0, 10)
                    })
                }
            })
        },
        isRecentMessage(messageTime) {
            // Highlight messages that appeared within the last 2 seconds
            const recentWindow = 2000 // 2 seconds
            return messageTime > (this.cursorTime - recentWindow) && messageTime <= this.cursorTime
        }
    },
    computed: {
        filteredData () {
            // this seems necessary to force a recomputation
            // eslint-disable-next-line
            let potato = this.forceRecompute
            
            const currentTime = this.cursorTime
            
            // Show only messages within a time window around current time
            // This creates a "real-time" effect as timeline progresses
            const filteredMessages = this.state.textMessages.filter(msg => {
                const msgTime = msg[0] // message timestamp
                // Show messages that are within the time window of current time
                return msgTime >= (currentTime - this.timeWindow) && msgTime <= currentTime
            }).slice(-10) // Show only the last 10 messages to prevent overflow
            
            // Debug only when there are new messages or time changes significantly
            if (filteredMessages.length > 0 && Math.abs(currentTime - this.lastMessageTime) > 1000) {
                console.log('MessageViewer filtered:', {
                    currentTime: currentTime,
                    timeWindow: this.timeWindow,
                    filteredCount: filteredMessages.length,
                    totalMessages: this.state.textMessages.length,
                    timeRange: filteredMessages.length > 0 ? 
                        `${filteredMessages[0][0]} - ${filteredMessages[filteredMessages.length-1][0]}` : 'none'
                })
                this.lastMessageTime = currentTime
            }
            
            return filteredMessages
        }
    },
    watch: {
        filteredData: function (data) {
            const container = this.$el.querySelector('#paneContent')
            container.scrollTop = container.scrollHeight
        }
    }
}
</script>

<style scoped>
    div #paneMessageViewer {
        min-width: 220px;
        min-height: 150px;
        position: absolute;
        background: rgba(253, 254, 255, 0.856);
        color: #141924;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        z-index: 10000;
        box-shadow: 9px 9px 3px -6px rgba(26, 26, 26, 0.699);
        border-radius: 5px;
        user-select: none;
    }

    div #paneMessageViewer::before {
        content: '\25e2';
        color: #ffffff;
        background-color: rgb(38, 53, 71);
        position: absolute;
        bottom: -1px;
        right: 0;
        width: 17px;
        height: 21px;
        padding: 2px 3px;
        border-radius: 10px 0px 1px 0px;
        box-sizing: border-box;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        cursor: se-resize;
    }

     div #paneMessageViewer::after {
        content: '\2725';
        color: #2E3F54;
        position: absolute;
        top: 0;
        left: 0;
        width: 18px;
        height: 17px;
        margin-top: -3px;
        padding: 0px 2px;
        box-sizing: border-box;
        align-items: center;
        justify-content: center;
        font-size: 17px;
         cursor: grab;
    }

    div#paneContent {
        height: 100%;
        overflow: auto;
        -webkit-user-select: none; /* Chrome all / Safari all */
        -moz-user-select: none; /* Firefox all */
        -ms-user-select: none; /* IE 10+ */
        user-select: none;
    }

    div#paneContent ul {
        list-style: none;
        line-height: 22px;
        padding: 16px;
        margin: 0;
    }

    .message-item {
        padding: 2px 0;
        border-left: 3px solid transparent;
        transition: all 0.3s ease;
    }

    .message-item.recent-message {
        background-color: rgba(76, 175, 80, 0.1);
        border-left-color: #4CAF50;
        animation: messageAppear 0.5s ease-out;
    }

    .message-time {
        color: #666;
        font-weight: normal;
        font-size: 10px;
    }

    .message-text {
        color: #141924;
        font-weight: 600;
    }

    .message-header {
        background: rgba(0, 0, 0, 0.05);
        font-weight: normal !important;
        text-transform: none !important;
    }

    @keyframes messageAppear {
        from {
            opacity: 0;
            transform: translateX(-10px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

</style>
