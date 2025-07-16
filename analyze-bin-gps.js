#!/usr/bin/env node

// Script to analyze GPS data in ArduPilot .bin log files
// Run with: node analyze-bin-gps.js

const fs = require('fs')
const path = require('path')

// Check if the .bin file exists
const binLogPath = path.join(__dirname, 'src', 'assets', '2025-05-26 12-07-34.bin')

if (fs.existsSync(binLogPath)) {
    console.log('Reading ArduPilot .bin log file:', binLogPath)
    
    const buffer = fs.readFileSync(binLogPath)
    console.log('Log file size:', buffer.length, 'bytes')
    
    // ArduPilot .bin files have a specific format
    // Let's look for GPS message signatures
    let offset = 0
    let gpsCount = 0
    let sampleGPSMessages = []
    
    // ArduPilot .bin format starts with message headers
    // Look for common GPS message types
    const gpsMessageTypes = ['GPS', 'GPS2', 'GPA', 'GPB']
    
    console.log('Scanning for GPS message patterns...')
    
    // Look for ASCII patterns that might indicate GPS messages
    const logText = buffer.toString('ascii', 0, Math.min(10000, buffer.length))
    console.log('First 200 chars of log (ASCII interpretation):')
    console.log(logText.substring(0, 200).replace(/[^\x20-\x7E]/g, '.'))
    
    // Look for GPS patterns in the binary data
    for (let i = 0; i < buffer.length - 8; i++) {
        // Look for potential message headers
        if (buffer[i] === 0xA3 && buffer[i + 1] === 0x95) {
            // This looks like a potential ArduPilot message header
            const msgType = buffer[i + 2]
            if (i + 50 < buffer.length) {
                gpsCount++
                if (gpsCount <= 5) {
                    const sample = {
                        offset: i,
                        msgType: msgType,
                        nextBytes: Array.from(buffer.slice(i, i + 20)).map(b => b.toString(16).padStart(2, '0')).join(' ')
                    }
                    sampleGPSMessages.push(sample)
                }
            }
        }
    }
    
    console.log('Found potential message headers:', gpsCount)
    console.log('Sample messages:', sampleGPSMessages)
    
    // Try to identify the format by looking at the file structure
    console.log('\nFile structure analysis:')
    console.log('First 32 bytes (hex):', Array.from(buffer.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' '))
    
    // Look for FMT messages which define the format
    const fmtPattern = Buffer.from('FMT', 'ascii')
    let fmtFound = false
    let formatDefinitions = []
    
    for (let i = 0; i < buffer.length - 10; i++) {
        if (buffer.indexOf(fmtPattern, i) === i) {
            console.log('Found FMT pattern at offset:', i)
            const context = buffer.slice(Math.max(0, i-10), i+100).toString('ascii').replace(/[^\x20-\x7E]/g, '.')
            console.log('Context:', context)
            
            // Try to extract format definition
            const fmtEnd = context.indexOf('\0', 10)
            if (fmtEnd > 0) {
                const formatDef = context.substring(0, fmtEnd)
                formatDefinitions.push(formatDef)
                console.log('Format definition:', formatDef)
            }
            
            fmtFound = true
            // Continue looking for more FMT messages
        }
    }
    
    if (!fmtFound) {
        console.log('No FMT pattern found - this might be a different format')
    } else {
        console.log('\nAll format definitions found:')
        formatDefinitions.forEach((def, index) => {
            console.log(`${index + 1}: ${def}`)
        })
    }
    
    // Look specifically for GPS-related message types
    console.log('\nLooking for GPS message types...')
    const gpsPatterns = ['GPS', 'GPS2', 'GPA', 'GPB', 'GRAW', 'GWK', 'GMS']
    
    gpsPatterns.forEach(pattern => {
        const patternBuffer = Buffer.from(pattern, 'ascii')
        let count = 0
        let firstOffset = -1
        
        for (let i = 0; i < buffer.length - pattern.length; i++) {
            if (buffer.indexOf(patternBuffer, i) === i) {
                if (firstOffset === -1) firstOffset = i
                count++
                if (count > 1000) break // Avoid counting too many
            }
        }
        
        if (count > 0) {
            console.log(`Found ${count} instances of '${pattern}' (first at offset ${firstOffset})`)
            
            // Show context around first occurrence
            if (firstOffset >= 0) {
                const context = buffer.slice(Math.max(0, firstOffset-20), firstOffset+50)
                    .toString('ascii').replace(/[^\x20-\x7E]/g, '.')
                console.log(`  Context: ${context}`)
            }
        }
    })
    
    // Look for timestamp-related patterns
    console.log('\nLooking for timestamp-related patterns...')
    const timePatterns = ['TimeUS', 'GWk', 'GMS', 'T', 'Week', 'MSec']
    
    timePatterns.forEach(pattern => {
        const patternBuffer = Buffer.from(pattern, 'ascii')
        let count = 0
        let firstOffset = -1
        
        for (let i = 0; i < buffer.length - pattern.length; i++) {
            if (buffer.indexOf(patternBuffer, i) === i) {
                if (firstOffset === -1) firstOffset = i
                count++
                if (count > 100) break // Limit search
            }
        }
        
        if (count > 0) {
            console.log(`Found ${count} instances of '${pattern}' (first at offset ${firstOffset})`)
        }
    })
    
    // Try to parse some actual data messages to see timestamp values
    console.log('\nAttempting to parse sample data messages...')
    
    // Look for potential GPS data messages (not just format definitions)
    let dataMessageCount = 0
    for (let i = 0; i < buffer.length - 50; i++) {
        if (buffer[i] === 0xA3 && buffer[i + 1] === 0x95) {
            const msgType = buffer[i + 2]
            
            // Skip format messages (type 0x80)
            if (msgType !== 0x80 && dataMessageCount < 10) {
                dataMessageCount++
                
                // Try to read some values from the message
                const msgLength = buffer[i + 3]
                if (msgLength > 0 && msgLength < 100 && i + msgLength < buffer.length) {
                    const messageData = buffer.slice(i, i + msgLength)
                    
                    console.log(`Data message ${dataMessageCount}:`)
                    console.log(`  Offset: ${i}, Type: 0x${msgType.toString(16)}, Length: ${msgLength}`)
                    console.log(`  Raw bytes: ${Array.from(messageData.slice(0, Math.min(20, msgLength))).map(b => b.toString(16).padStart(2, '0')).join(' ')}`)
                    
                    // Try to extract potential timestamp (usually first 8 bytes after header)
                    if (msgLength >= 12) {
                        const timestampBytes = messageData.slice(4, 12)
                        const timestamp = timestampBytes.readBigUInt64LE(0)
                        console.log(`  Potential TimeUS: ${timestamp} (${Number(timestamp) / 1000000} seconds)`)
                    }
                }
            }
        }
    }
    
} else {
    console.log('ArduPilot .bin log file not found at:', binLogPath)
    
    // List available files in assets directory
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
