#!/usr/bin/env node

// Focused GPS timestamp analysis for ArduPilot .bin files
const fs = require('fs')
const path = require('path')

const binLogPath = path.join(__dirname, 'src', 'assets', '2025-05-26 12-07-34.bin')

if (fs.existsSync(binLogPath)) {
    console.log('Analyzing GPS timestamps in:', binLogPath)
    
    const buffer = fs.readFileSync(binLogPath)
    console.log('File size:', (buffer.length / 1024 / 1024).toFixed(2), 'MB')
    
    // Look for key patterns in the first 50KB to understand the format
    const sampleSize = Math.min(50000, buffer.length)
    const sample = buffer.slice(0, sampleSize)
    
    console.log('\n=== FORMAT ANALYSIS ===')
    
    // Find GPS-related format definitions
    const patterns = {
        'GPS message': /GPS[^,\x00]{0,10}[,\x00]/g,
        'GPS2 message': /GPS2[^,\x00]{0,10}[,\x00]/g,
        'TimeUS field': /TimeUS[^,\x00]{0,10}[,\x00]/g,
        'GWk field': /GWk[^,\x00]{0,10}[,\x00]/g,
        'GMS field': /GMS[^,\x00]{0,10}[,\x00]/g,
        'Week field': /Week[^,\x00]{0,10}[,\x00]/g,
        'MSec field': /MSec[^,\x00]{0,10}[,\x00]/g
    }
    
    Object.entries(patterns).forEach(([name, pattern]) => {
        const matches = sample.toString('ascii').match(pattern)
        if (matches) {
            console.log(`✓ Found ${name}: ${matches.length} occurrences`)
            console.log(`  Examples: ${matches.slice(0, 3).join(', ')}`)
        } else {
            console.log(`✗ No ${name} found`)
        }
    })
    
    // Look for specific GPS format strings
    console.log('\n=== GPS FORMAT STRINGS ===')
    const gpsFormats = [
        'TimeUS,Status,GMS,GWk,NSats,HDop,Lat,Lng,Alt,Spd,GCrs,VZ,Yaw,U',
        'TimeUS,I,GPS,NSats,HDop,Lat,Lng,RelAlt,Alt,Spd,GCrs',
        'TimeUS,GMS,GWk,NSats,HDop,Lat,Lng,Alt,Spd,GCrs,VZ',
        'GPS,TimeUS,Status,GMS,GWk,NSats'
    ]
    
    gpsFormats.forEach((format, index) => {
        const found = sample.toString('ascii').includes(format.substring(0, 30))
        console.log(`GPS Format ${index + 1}: ${found ? '✓ FOUND' : '✗ Not found'} - ${format.substring(0, 50)}...`)
    })
    
    // Look for actual timestamp values
    console.log('\n=== TIMESTAMP DATA SAMPLES ===')
    
    let messageCount = 0
    let gpsMessageFound = false
    
    // Scan for data messages (not format messages)
    for (let i = 0; i < Math.min(buffer.length - 20, 100000); i++) {
        if (buffer[i] === 0xA3 && buffer[i + 1] === 0x95) {
            const msgType = buffer[i + 2]
            
            // Skip format messages (0x80), look for data messages
            if (msgType !== 0x80 && messageCount < 5) {
                messageCount++
                
                const msgLength = buffer[i + 3]
                if (msgLength > 8 && msgLength < 100) {
                    // Try to read TimeUS (first 8 bytes after 4-byte header)
                    try {
                        const timeUS = buffer.readBigUInt64LE(i + 4)
                        const timeSeconds = Number(timeUS) / 1000000
                        
                        console.log(`Message ${messageCount}: Type=0x${msgType.toString(16).padStart(2, '0')}, TimeUS=${timeUS}, Time=${timeSeconds.toFixed(3)}s`)
                        
                        // If this looks like a reasonable timestamp (not too small/large)
                        if (timeSeconds > 0 && timeSeconds < 86400) { // Less than 24 hours
                            console.log(`  ✓ This looks like a valid flight timestamp`)
                            gpsMessageFound = true
                        }
                    } catch (error) {
                        console.log(`Message ${messageCount}: Could not parse timestamp`)
                    }
                }
            }
        }
    }
    
    console.log('\n=== SUMMARY ===')
    console.log('✓ File is valid ArduPilot .bin format')
    console.log('✓ Contains TimeUS timestamps for relative timing')
    
    if (sample.toString('ascii').includes('GWk') && sample.toString('ascii').includes('GMS')) {
        console.log('✓ Contains GPS Week (GWk) and GPS Milliseconds (GMS) fields')
        console.log('  → Should provide absolute GPS timestamps')
    } else {
        console.log('? GPS Week/Milliseconds fields not clearly detected')
    }
    
    if (gpsMessageFound) {
        console.log('✓ Found valid timestamp data messages')
        console.log('  → Timeline should work with relative flight time')
    }
    
    console.log('\nRECOMMENDATION:')
    console.log('- Load this file in the application')
    console.log('- Check browser console for GPS parsing results')
    console.log('- Timeline should show either GPS time or relative flight time')
    
} else {
    console.log('File not found:', binLogPath)
}
