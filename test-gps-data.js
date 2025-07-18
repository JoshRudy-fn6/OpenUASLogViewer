#!/usr/bin/env node

// Simple test script to examine GPS data in log files
// Run with: node test-gps-data.js

const fs = require('fs')
const path = require('path')

// Simple MAVLink message parser (basic version)
function parseMAVLinkMessages(buffer) {
    const messages = []
    let offset = 0
    
    while (offset < buffer.length - 8) {
        // Look for MAVLink v2 magic byte (0xFD)
        if (buffer[offset] === 0xFD) {
            try {
                const length = buffer[offset + 1]
                const msgid = buffer.readUInt32LE(offset + 7) & 0xFFFFFF
                
                // Skip to next potential message
                offset += length + 12
                
                // Log message IDs that might contain GPS data
                if (msgid === 24 || msgid === 33 || msgid === 109) { // GPS_RAW_INT, GLOBAL_POSITION_INT, GPS_STATUS
                    messages.push({ msgid, offset: offset - length - 12 })
                }
            } catch (e) {
                offset++
            }
        } else {
            offset++
        }
    }
    
    return messages
}

// Test the sample log file
const sampleLogPath = path.join(__dirname, 'src', 'assets', 'vtol.tlog')

if (fs.existsSync(sampleLogPath)) {
    console.log('Reading sample log file:', sampleLogPath)
    
    const buffer = fs.readFileSync(sampleLogPath)
    console.log('Log file size:', buffer.length, 'bytes')
    
    const gpsMessages = parseMAVLinkMessages(buffer)
    console.log('Found potential GPS messages:', gpsMessages.length)
    
    if (gpsMessages.length > 0) {
        console.log('GPS message IDs found:', [...new Set(gpsMessages.map(m => m.msgid))])
        console.log('First few GPS messages:', gpsMessages.slice(0, 5))
    } else {
        console.log('No GPS messages found with basic parser')
    }
    
    // Also check file header for log type identification
    const header = buffer.slice(0, 100).toString('ascii', 0, 50)
    console.log('File header (first 50 chars):', header)
    
} else {
    console.log('Sample log file not found at:', sampleLogPath)
    console.log('Current directory:', __dirname)
    
    // List available files
    const assetsDir = path.join(__dirname, 'src', 'assets')
    if (fs.existsSync(assetsDir)) {
        console.log('Available files in assets:')
        fs.readdirSync(assetsDir).forEach(file => {
            const filePath = path.join(assetsDir, file)
            const stats = fs.statSync(filePath)
            console.log(`  ${file} (${stats.size} bytes)`)
        })
    }
}
