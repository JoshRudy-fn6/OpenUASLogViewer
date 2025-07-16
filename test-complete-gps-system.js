#!/usr/bin/env node

// Complete test of the GPS timeline integration system
const fs = require('fs')
const path = require('path')

// Mock browser environment for Node.js testing
global.window = {}
global.Buffer = Buffer

// Import our modules
const GPSTimestampExtractor = require('./src/utils/gpsTimestampExtractor.js')
const { FlightLogGPSIntegrator } = require('./src/utils/flightLogGPSIntegrator.js')

async function testCompleteGPSSystem() {
    console.log('=== COMPLETE GPS TIMELINE INTEGRATION TEST ===')
    
    const binLogPath = path.join(__dirname, 'src', 'assets', '2025-05-26 12-07-34.bin')
    
    if (!fs.existsSync(binLogPath)) {
        console.log('❌ Test file not found:', binLogPath)
        return
    }

    const buffer = fs.readFileSync(binLogPath)
    const filename = path.basename(binLogPath)
    
    console.log('📁 Testing with:', filename)
    console.log('📏 File size:', (buffer.length / 1024 / 1024).toFixed(2), 'MB')
    
    // Step 1: Initialize the integrator
    console.log('\n--- Step 1: Initialize GPS Integrator ---')
    const integrator = new FlightLogGPSIntegrator()
    
    // Step 2: Process the flight log
    console.log('\n--- Step 2: Process Flight Log ---')
    const gpsData = await integrator.processFlightLog(buffer, 'bin')
    
    console.log('📊 Processing Results:')
    console.log(`  GPS Lock: ${gpsData.hasGPSLock ? '✅ YES' : '❌ NO'}`)
    console.log(`  Flight Duration: ${gpsData.flightDuration.toFixed(2)} seconds`)
    console.log(`  GPS Messages: ${gpsData.gpsMessages.length}`)
    console.log(`  Relative Time Messages: ${gpsData.relativeTimeMessages.length}`)
    
    if (gpsData.startTime) {
        console.log(`  Flight Start Time: ${gpsData.startTime.toISOString()}`)
    }
    
    // Step 3: Search for GPS timestamps
    console.log('\n--- Step 3: Search GPS Timestamps ---')
    const searchResults = integrator.searchGPSTimestamps(buffer, 'bin')
    
    console.log('🔍 Search Results:')
    console.log(`  GPS Data Found: ${searchResults.found ? '✅ YES' : '❌ NO'}`)
    console.log(`  GPS Weeks: [${searchResults.gpsWeeks.join(', ')}]`)
    console.log(`  Message Types: [${searchResults.messageTypes.join(', ')}]`)
    console.log(`  Flight Duration: ${searchResults.flightDuration.toFixed(2)}s`)
    
    if (searchResults.sampleTimestamps.length > 0) {
        console.log('  Sample Timestamps:')
        searchResults.sampleTimestamps.forEach((sample, i) => {
            console.log(`    ${i + 1}. Week ${sample.week}, MS ${sample.ms} -> ${sample.utc} (T+${sample.relative})`)
        })
    }
    
    // Step 4: Validate timestamp correlation
    console.log('\n--- Step 4: Validate Timestamp Correlation ---')
    const correlation = integrator.validateTimestampCorrelation(filename, gpsData)
    
    console.log('🕐 Correlation Analysis:')
    console.log(`  Valid: ${correlation.valid ? '✅ YES' : '❌ NO'}`)
    if (correlation.expectedTime) {
        console.log(`  Filename Time: ${correlation.expectedTime}`)
        console.log(`  Actual GPS Time: ${correlation.actualTime}`)
        console.log(`  Difference: ${correlation.differenceMinutes} minutes`)
        console.log(`  Correlation Quality: ${correlation.correlation.toUpperCase()}`)
    } else {
        console.log(`  Reason: ${correlation.reason}`)
    }
    
    // Step 5: Create mock mapViewer and integrate
    console.log('\n--- Step 5: Timeline Integration Simulation ---')
    const mockMapViewer = { state: {} }
    
    integrator.integrateWithTimeline(mockMapViewer, gpsData)
    
    console.log('🎯 Timeline Integration:')
    console.log(`  GPS Messages Available: ${!!mockMapViewer.state.messages?.GPS}`)
    console.log(`  GPS Message Count: ${mockMapViewer.state.messages?.GPS?.length || 0}`)
    console.log(`  PSQ Messages: ${mockMapViewer.state.messages?.PSQ?.length || 0}`)
    console.log(`  BREQ Messages: ${mockMapViewer.state.messages?.BREQ?.length || 0}`)
    console.log(`  TimeUS Messages: ${mockMapViewer.state.messages?.TimeUS?.length || 0}`)
    console.log(`  GPS Metadata: ${!!mockMapViewer.state.gpsMetadata}`)
    
    // Step 6: Simulate timeline GPS lookup
    console.log('\n--- Step 6: Simulate Timeline GPS Lookup ---')
    
    if (mockMapViewer.state.messages?.GPS?.length > 0) {
        const sampleGPS = mockMapViewer.state.messages.GPS[0]
        console.log('📡 Sample GPS Message Structure:')
        console.log('  Fields:', Object.keys(sampleGPS))
        console.log('  ArduPilot format:', { GWk: sampleGPS.GWk, GMS: sampleGPS.GMS })
        console.log('  MAVLink format:', { time_week: sampleGPS.time_week, time_week_ms: sampleGPS.time_week_ms })
        console.log('  Boot time correlation:', sampleGPS.time_boot_ms, 'ms')
        
        // Test the GPS time calculation logic
        if (sampleGPS.GWk && sampleGPS.GMS && sampleGPS.GWk > 1000 && sampleGPS.GWk < 10000) {
            const gpsEpoch = new Date('1980-01-06T00:00:00Z').getTime()
            const utcTime = gpsEpoch + (sampleGPS.GWk * 7 * 24 * 60 * 60 * 1000) + sampleGPS.GMS
            const calculatedDate = new Date(utcTime)
            
            console.log('✅ GPS Time Calculation Test:')
            console.log(`  GPS Week: ${sampleGPS.GWk}`)
            console.log(`  GPS MS: ${sampleGPS.GMS}`)
            console.log(`  Calculated UTC: ${calculatedDate.toISOString()}`)
            console.log(`  Formatted: ${calculatedDate.toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            })}`)
        } else {
            console.log('⚠️ GPS Week/MS values not in expected range for calculation')
        }
    }
    
    // Step 7: Method summary
    console.log('\n--- Step 7: Method Summary ---')
    const methodSummary = integrator.getMethodSummary()
    
    console.log('📋 ' + methodSummary.title + ':')
    methodSummary.steps.forEach(step => console.log('  ' + step))
    
    console.log('\n📝 Supported Formats:')
    methodSummary.supportedFormats.forEach(format => console.log('  • ' + format))
    
    console.log('\n📤 Output Formats:')
    methodSummary.outputFormats.forEach(format => console.log('  • ' + format))
    
    console.log('\n🎉 Complete GPS Timeline Integration Test Finished!')
    
    return {
        success: gpsData.hasGPSLock || gpsData.relativeTimeMessages.length > 0,
        gpsData,
        correlation,
        mockMapViewer
    }
}

// Run the complete test
testCompleteGPSSystem().then(result => {
    if (result.success) {
        console.log('\n✅ SUCCESS: GPS timeline integration system is working!')
    } else {
        console.log('\n❌ ISSUES: GPS data extraction needs refinement')
    }
}).catch(error => {
    console.error('\n💥 ERROR:', error)
})
