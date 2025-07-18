#!/usr/bin/env node

// Debug format parsing to understand why PSQ is missing
const fs = require('fs')
const path = require('path')

function debugFormatParsing() {
    const binLogPath = path.join(__dirname, 'src', 'assets', '2025-05-26 12-07-34.bin')
    
    if (!fs.existsSync(binLogPath)) {
        console.log('Test file not found:', binLogPath)
        return
    }

    const buffer = fs.readFileSync(binLogPath)
    console.log('=== DEBUG FORMAT PARSING ===')
    console.log('File size:', (buffer.length / 1024 / 1024).toFixed(2), 'MB')
    
    let offset = 0
    let formatCount = 0
    const formats = new Map()

    while (offset < buffer.length - 10 && formatCount < 100) {
        // Look for ArduPilot message header
        if (buffer[offset] === 0xA3 && buffer[offset + 1] === 0x95) {
            const msgType = buffer[offset + 2]
            const length = buffer[offset + 3]
            
            if (length > 200 || length < 4) {
                offset++
                continue
            }
            
            // Check if this is a format message (type 0x80)
            if (msgType === 0x80) {
                try {
                    console.log(`\nFormat message at offset ${offset}:`)
                    console.log(`  Header: 0x${buffer[offset].toString(16)} 0x${buffer[offset+1].toString(16)}`)
                    console.log(`  MsgType: ${msgType} (0x${msgType.toString(16)})`)
                    console.log(`  Length: ${length}`)
                    
                    // Show raw bytes for debugging
                    const rawBytes = []
                    for (let i = 0; i < Math.min(length, 20); i++) {
                        rawBytes.push('0x' + buffer[offset + i].toString(16).padStart(2, '0'))
                    }
                    console.log(`  Raw bytes: ${rawBytes.join(' ')}`)
                    
                    // Parse format structure
                    const formatMsgType = buffer[offset + 4]
                    const formatLength = buffer[offset + 5]
                    
                    console.log(`  Defines msgType: ${formatMsgType}`)
                    console.log(`  Format length: ${formatLength}`)
                    
                    const name = buffer.slice(offset + 6, offset + 10).toString('ascii').replace(/\0/g, '').trim()
                    const format = buffer.slice(offset + 10, offset + 26).toString('ascii').replace(/\0/g, '').trim()
                    const labels = buffer.slice(offset + 26, offset + 90).toString('ascii').replace(/\0/g, '').trim()
                    
                    console.log(`  Name: "${name}"`)
                    console.log(`  Format: "${format}"`)
                    console.log(`  Labels: "${labels}"`)
                    
                    if (name === 'PSQ' || labels.includes('GWk') || labels.includes('GMS')) {
                        console.log(`  *** GPS-RELATED MESSAGE FOUND! ***`)
                    }
                    
                    formats.set(formatMsgType, { name, format, labels })
                    formatCount++
                    
                } catch (error) {
                    console.log(`  Error parsing: ${error.message}`)
                }
            }
            
            offset += length
        } else {
            offset++
        }
    }
    
    console.log(`\n=== SUMMARY ===`)
    console.log(`Found ${formats.size} format definitions`)
    
    // Look for GPS-related formats
    console.log(`\n=== GPS-RELATED FORMATS ===`)
    for (const [type, def] of formats) {
        if (def.name === 'PSQ' || def.name === 'BREQ' || def.name === 'RAWQ' || 
            def.labels.includes('GWk') || def.labels.includes('GMS') || def.labels.includes('TimeUS')) {
            console.log(`  Type ${type}: ${def.name} - ${def.labels}`)
        }
    }
}

debugFormatParsing()
