#!/usr/bin/env node

// ArduPilot .bin file parser to extract actual GPS and timestamp data
const fs = require('fs')
const path = require('path')

class ArduPilotLogParser {
    constructor(buffer) {
        this.buffer = buffer
        this.offset = 0
        this.messageTypes = new Map()
        this.messages = []
    }

    readUInt8() {
        return this.buffer.readUInt8(this.offset++)
    }

    readUInt16LE() {
        const val = this.buffer.readUInt16LE(this.offset)
        this.offset += 2
        return val
    }

    readUInt32LE() {
        const val = this.buffer.readUInt32LE(this.offset)
        this.offset += 4
        return val
    }

    readUInt64LE() {
        const val = this.buffer.readBigUInt64LE(this.offset)
        this.offset += 8
        return val
    }

    readFloat() {
        const val = this.buffer.readFloatLE(this.offset)
        this.offset += 4
        return val
    }

    readString(length) {
        const str = this.buffer.slice(this.offset, this.offset + length).toString('ascii').replace(/\0/g, '')
        this.offset += length
        return str
    }

    parseFormatMessage() {
        const type = this.readUInt8()
        const length = this.readUInt8()
        const name = this.readString(4).trim()
        const format = this.readString(16).trim()
        const labels = this.readString(64).trim()

        const formatDef = {
            type,
            length,
            name,
            format,
            labels: labels.split(',').map(l => l.trim()).filter(l => l.length > 0)
        }

        this.messageTypes.set(type, formatDef)
        console.log(`Format ${type}: ${name} - ${formatDef.labels.join(', ')}`)
        
        return formatDef
    }

    parseDataMessage(msgType) {
        const formatDef = this.messageTypes.get(msgType)
        if (!formatDef) {
            console.log(`Unknown message type: ${msgType}`)
            return null
        }

        const data = { type: formatDef.name, msgType }
        
        for (let i = 0; i < formatDef.format.length && i < formatDef.labels.length; i++) {
            const formatChar = formatDef.format[i]
            const label = formatDef.labels[i]
            
            try {
                switch (formatChar) {
                    case 'B': // uint8
                        data[label] = this.readUInt8()
                        break
                    case 'H': // uint16
                        data[label] = this.readUInt16LE()
                        break
                    case 'I': // uint32
                        data[label] = this.readUInt32LE()
                        break
                    case 'Q': // uint64
                        data[label] = this.readUInt64LE()
                        break
                    case 'f': // float
                        data[label] = this.readFloat()
                        break
                    case 'L': // int32 (latitude/longitude)
                        data[label] = this.readUInt32LE()
                        break
                    case 'e': // int32
                        data[label] = this.readUInt32LE()
                        break
                    case 'n': // char[4]
                        data[label] = this.readString(4)
                        break
                    case 'N': // char[16]
                        data[label] = this.readString(16)
                        break
                    case 'Z': // char[64]
                        data[label] = this.readString(64)
                        break
                    default:
                        console.log(`Unknown format character: ${formatChar}`)
                        this.offset++ // Skip unknown byte
                }
            } catch (error) {
                console.log(`Error parsing field ${label}: ${error.message}`)
                break
            }
        }

        return data
    }

    parse() {
        console.log('Parsing ArduPilot .bin file...')
        
        while (this.offset < this.buffer.length - 10) {
            // Look for message header
            if (this.buffer[this.offset] === 0xA3 && this.buffer[this.offset + 1] === 0x95) {
                this.offset += 2 // Skip header bytes
                
                const msgType = this.readUInt8()
                const length = this.readUInt8()
                
                const startOffset = this.offset
                
                try {
                    if (msgType === 0x80) {
                        // Format message
                        const formatDef = this.parseFormatMessage()
                    } else {
                        // Data message
                        const data = this.parseDataMessage(msgType)
                        if (data) {
                            this.messages.push(data)
                            
                            // Show first few messages of each type
                            const typeCount = this.messages.filter(m => m.type === data.type).length
                            if (typeCount <= 3) {
                                console.log(`${data.type} message:`, data)
                            }
                        }
                    }
                } catch (error) {
                    console.log(`Error parsing message type ${msgType}: ${error.message}`)
                }
                
                // Ensure we advance by the message length
                this.offset = startOffset + length - 4 // -4 because we already read type and length
                
            } else {
                this.offset++
            }
        }
        
        return this.messages
    }

    analyzeTimestamps() {
        console.log('\n=== TIMESTAMP ANALYSIS ===')
        
        // Look for GPS messages
        const gpsMessages = this.messages.filter(m => 
            m.type === 'GPS' || m.type === 'GPS2' || m.type.includes('GPS')
        )
        
        console.log(`Found ${gpsMessages.length} GPS messages`)
        if (gpsMessages.length > 0) {
            console.log('GPS message fields:', Object.keys(gpsMessages[0]))
            console.log('First GPS message:', gpsMessages[0])
            console.log('Last GPS message:', gpsMessages[gpsMessages.length - 1])
        }
        
        // Look for any messages with TimeUS
        const timeUSMessages = this.messages.filter(m => m.TimeUS !== undefined)
        console.log(`Found ${timeUSMessages.length} messages with TimeUS`)
        
        if (timeUSMessages.length > 0) {
            const first = timeUSMessages[0]
            const last = timeUSMessages[timeUSMessages.length - 1]
            
            console.log(`First TimeUS: ${first.TimeUS} (${Number(first.TimeUS) / 1000000}s)`)
            console.log(`Last TimeUS: ${last.TimeUS} (${Number(last.TimeUS) / 1000000}s)`)
            console.log(`Flight duration: ${(Number(last.TimeUS) - Number(first.TimeUS)) / 1000000}s`)
        }
        
        // Look for GPS week/millisecond data
        const gpsTimeMessages = this.messages.filter(m => 
            m.GWk !== undefined || m.GMS !== undefined || 
            m.Week !== undefined || m.MSec !== undefined
        )
        
        console.log(`Found ${gpsTimeMessages.length} messages with GPS time data`)
        if (gpsTimeMessages.length > 0) {
            console.log('GPS time message sample:', gpsTimeMessages[0])
        }
        
        // Show unique message types
        const types = [...new Set(this.messages.map(m => m.type))]
        console.log('\nMessage types found:', types.sort())
        
        // Show count by type
        console.log('\nMessage counts:')
        types.forEach(type => {
            const count = this.messages.filter(m => m.type === type).length
            console.log(`  ${type}: ${count}`)
        })
    }
}

// Main execution
const binLogPath = path.join(__dirname, 'src', 'assets', '2025-05-26 12-07-34.bin')
const outputPath = path.join(__dirname, 'bin-analysis-output.txt')

// Redirect console.log to file
const originalLog = console.log
const logOutput = []

console.log = (...args) => {
    const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')
    logOutput.push(message)
    originalLog(...args) // Still show on console
}

if (fs.existsSync(binLogPath)) {
    console.log('Parsing:', binLogPath)
    console.log('Output will be saved to:', outputPath)
    
    const buffer = fs.readFileSync(binLogPath)
    console.log('File size:', (buffer.length / 1024 / 1024).toFixed(2), 'MB')
    
    const parser = new ArduPilotLogParser(buffer)
    const messages = parser.parse()
    
    console.log(`\nParsed ${messages.length} total messages`)
    
    parser.analyzeTimestamps()
    
    // Write output to file
    fs.writeFileSync(outputPath, logOutput.join('\n'))
    console.log('\nOutput saved to:', outputPath)
    
} else {
    console.log('File not found:', binLogPath)
}
