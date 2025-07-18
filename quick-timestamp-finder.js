#!/usr/bin/env node

// Fast timestamp finder for ArduPilot .bin files
const fs = require('fs')
const path = require('path')

function findTimestampsQuick(buffer) {
    console.log('Quick timestamp analysis...')
    
    // First, let's find the format definitions quickly
    const formats = new Map()
    let offset = 0
    let formatCount = 0
    
    console.log('Scanning for format definitions...')
    
    while (offset < buffer.length - 100 && formatCount < 50) {
        if (buffer[offset] === 0xA3 && buffer[offset + 1] === 0x95 && buffer[offset + 2] === 0x80) {
            // This is a format message
            try {
                const type = buffer[offset + 4]
                const length = buffer[offset + 5]
                const name = buffer.slice(offset + 6, offset + 10).toString('ascii').replace(/\0/g, '').trim()
                const format = buffer.slice(offset + 10, offset + 26).toString('ascii').replace(/\0/g, '').trim()
                const labels = buffer.slice(offset + 26, offset + 90).toString('ascii').replace(/\0/g, '').trim()
                
                formats.set(type, {
                    name,
                    format,
                    labels: labels.split(',').map(l => l.trim()).filter(l => l.length > 0),
                    length
                })
                
                console.log(`Format ${type}: ${name} - fields: ${labels.split(',').slice(0, 5).join(', ')}...`)
                
                if (name === 'GPS' || name === 'GPS2' || name.includes('GPS')) {
                    console.log(`  ★ GPS FORMAT FOUND: ${name}`)
                    console.log(`    Fields: ${labels}`)
                    console.log(`    Format: ${format}`)
                }
                
                formatCount++
                offset += length
            } catch (error) {
                offset++
            }
        } else {
            offset++
        }
    }
    
    console.log(`Found ${formats.size} format definitions`)
    
    // Now look for actual GPS data messages
    console.log('\nLooking for GPS and time-related data messages...')
    
    const timeFormats = Array.from(formats.entries()).filter(([type, fmt]) => 
        fmt.name === 'GPS' || fmt.name === 'GPS2' || fmt.name.includes('GPS') ||
        fmt.labels.includes('GWk') || fmt.labels.includes('GMS') ||
        fmt.labels.includes('GPSTime') || fmt.labels.includes('GPSWeek') ||
        fmt.name === 'PSQ' || fmt.name === 'AMQ' || fmt.name === 'RIGQ' ||
        fmt.name === 'RAWQ'
    )
    
    if (timeFormats.length === 0) {
        console.log('❌ No GPS or time format definitions found')
        return
    }
    
    console.log(`Found ${timeFormats.length} time-related format(s):`)
    timeFormats.forEach(([type, fmt]) => {
        console.log(`  Type ${type}: ${fmt.name} - ${fmt.labels.join(', ')}`)
    })
    
    // Sample first few GPS messages
    console.log('\nSampling time-related messages...')
    
    offset = 0
    let gpsCount = 0
    let sampleCount = 0
    
    while (offset < buffer.length - 50 && sampleCount < 10) {
        if (buffer[offset] === 0xA3 && buffer[offset + 1] === 0x95) {
            const msgType = buffer[offset + 2]
            const length = buffer[offset + 3]
            
            // Check if this is a time-related message type
            const timeFormat = timeFormats.find(([type, fmt]) => type === msgType)
            
            if (timeFormat && length > 0 && length < 200) {
                const [type, fmt] = timeFormat
                console.log(`\n⏰ ${fmt.name} Message ${++sampleCount} (type ${type})`)
                
                try {
                    let dataOffset = offset + 4
                    const data = {}
                    
                    // Parse all fields to find timestamps
                    for (let i = 0; i < Math.min(fmt.format.length, fmt.labels.length); i++) {
                        const formatChar = fmt.format[i]
                        const label = fmt.labels[i]
                        
                        if (dataOffset >= offset + length) break
                        
                        try {
                            switch (formatChar) {
                                case 'Q': // uint64 - likely TimeUS
                                    if (dataOffset + 8 <= buffer.length) {
                                        data[label] = buffer.readBigUInt64LE(dataOffset)
                                        dataOffset += 8
                                    }
                                    break
                                case 'I': // uint32 - could be GWk, GMS
                                case 'L': // int32 - lat/lon
                                    if (dataOffset + 4 <= buffer.length) {
                                        data[label] = buffer.readUInt32LE(dataOffset)
                                        dataOffset += 4
                                    }
                                    break
                                case 'H': // uint16
                                    if (dataOffset + 2 <= buffer.length) {
                                        data[label] = buffer.readUInt16LE(dataOffset)
                                        dataOffset += 2
                                    }
                                    break
                                case 'B': // uint8
                                    if (dataOffset + 1 <= buffer.length) {
                                        data[label] = buffer.readUInt8(dataOffset)
                                        dataOffset += 1
                                    }
                                    break
                                case 'f': // float
                                    if (dataOffset + 4 <= buffer.length) {
                                        data[label] = buffer.readFloatLE(dataOffset)
                                        dataOffset += 4
                                    }
                                    break
                                default:
                                    dataOffset++ // Skip unknown types
                            }
                        } catch (err) {
                            console.log(`    Error reading ${label}: ${err.message}`)
                            break
                        }
                    }
                    
                    console.log(`  Data:`, data)
                    
                    // Check for timestamp fields
                    if (data.TimeUS || data.imeUS) {
                        const timeUS = data.TimeUS || data.imeUS
                        const timeSeconds = Number(timeUS) / 1000000
                        console.log(`  ⏰ TimeUS: ${timeUS} (${timeSeconds.toFixed(3)} seconds)`)
                    }
                    
                    if (data.GWk && data.GMS) {
                        console.log(`  📅 GPS Week: ${data.GWk}, GPS MS: ${data.GMS}`)
                        
                        // Calculate actual date if values seem reasonable
                        if (data.GWk > 1000 && data.GWk < 10000 && data.GMS < 604800000) {
                            const gpsEpoch = new Date('1980-01-06T00:00:00Z').getTime()
                            const utcTime = gpsEpoch + (data.GWk * 7 * 24 * 60 * 60 * 1000) + data.GMS
                            const date = new Date(utcTime)
                            console.log(`  📅 Calculated GPS time: ${date.toISOString()}`)
                            console.log(`  📅 Local time: ${date.toLocaleString()}`)
                        }
                    }
                    
                    if (data.GPSTime && data.GPSWeek) {
                        console.log(`  📅 GPS Time: ${data.GPSTime}, GPS Week: ${data.GPSWeek}`)
                        
                        if (data.GPSWeek > 1000 && data.GPSWeek < 10000) {
                            const gpsEpoch = new Date('1980-01-06T00:00:00Z').getTime()
                            const utcTime = gpsEpoch + (data.GPSWeek * 7 * 24 * 60 * 60 * 1000) + (data.GPSTime * 1000)
                            const date = new Date(utcTime)
                            console.log(`  📅 Calculated GPS time: ${date.toISOString()}`)
                            console.log(`  📅 Local time: ${date.toLocaleString()}`)
                        }
                    }
                    
                    if (data.WkMS && data.Week) {
                        console.log(`  📅 Week MS: ${data.WkMS}, Week: ${data.Week}`)
                    }
                    
                    if (data.Lat && data.Lng) {
                        console.log(`  🌍 Position: ${data.Lat / 1e7}, ${data.Lng / 1e7}`)
                    }
                    
                } catch (error) {
                    console.log(`  Error parsing ${fmt.name} message: ${error.message}`)
                }
                
                gpsCount++
            }
            
            offset += Math.max(1, length)
        } else {
            offset++
        }
    }
    
    console.log(`\nFound ${gpsCount} GPS messages total`)
    
    // Summary
    console.log('\n=== SUMMARY ===')
    if (timeFormats.length > 0) {
        console.log('✅ Time-related format definitions found')
        console.log('✅ Time messages detected')
        
        const hasTimeUS = timeFormats.some(([type, fmt]) => 
            fmt.labels.includes('TimeUS') || fmt.labels.includes('imeUS')
        )
        const hasGPSTime = timeFormats.some(([type, fmt]) => 
            (fmt.labels.includes('GWk') && fmt.labels.includes('GMS')) ||
            (fmt.labels.includes('GPSTime') && fmt.labels.includes('GPSWeek'))
        )
        
        if (hasTimeUS) {
            console.log('✅ TimeUS timestamps available (relative flight time)')
        }
        if (hasGPSTime) {
            console.log('✅ GPS Week/MS timestamps available (absolute GPS time)')
        }
        
        if (!hasTimeUS && !hasGPSTime) {
            console.log('❌ No recognizable timestamp formats found')
        }
        
        console.log('\nTime-related message types found:')
        timeFormats.forEach(([type, fmt]) => {
            const timeFields = fmt.labels.filter(label => 
                label.includes('Time') || label.includes('GWk') || label.includes('GMS') || 
                label.includes('Week') || label.includes('imeUS')
            )
            console.log(`  ${fmt.name}: ${timeFields.join(', ')}`)
        })
        
    } else {
        console.log('❌ No time-related data found in this log file')
    }
}

// Run the analysis
const binLogPath = path.join(__dirname, 'src', 'assets', '2025-05-26 12-07-34.bin')

if (fs.existsSync(binLogPath)) {
    console.log('Analyzing:', binLogPath)
    
    const buffer = fs.readFileSync(binLogPath)
    console.log('File size:', (buffer.length / 1024 / 1024).toFixed(2), 'MB')
    
    findTimestampsQuick(buffer)
    
} else {
    console.log('File not found:', binLogPath)
}
