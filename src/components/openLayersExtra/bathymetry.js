// OpenLayers Bathymetry Visualization
// Replaces Cesium 3D bathymetry with 2D contour mapping

import { Feature } from 'ol'
import { Polygon, Point } from 'ol/geom'
import { Style, Fill, Stroke, Text } from 'ol/style'
import { fromLonLat } from 'ol/proj'

export class BathymetryRenderer {
    constructor(map, options = {}) {
        this.map = map
        this.options = {
            contourLevels: 10,
            showPoints: false,
            pointRadius: 2,
            contourWidth: 1,
            contourOpacity: 0.7,
            fillOpacity: 0.3,
            colorScheme: 'blue',
            ...options
        }
        
        this.depthData = []
        this.contourFeatures = []
        this.hullFeature = null
    }

    async plotBathymetry(bathymetryData, positionData) {
        // Aggregate depth data with positions
        const positionsWithDepth = this.aggregateDepth(bathymetryData, positionData)
        
        if (positionsWithDepth.length === 0) {
            console.warn('No valid bathymetry data found')
            return
        }

        // Filter outliers
        const filteredData = this.filterOutliers(positionsWithDepth)
        
        // Generate contours
        const contours = this.generateContours(filteredData)
        
        // Create OpenLayers features
        const features = this.createContourFeatures(contours)
        
        // Add to map
        this.addFeaturesToMap(features)
        
        return features
    }

    aggregateDepth(bathymetry, positions) {
        const positionsWithDepth = []
        let lastIndex = 0

        for (const index in positions.time_boot_ms) {
            while (bathymetry.time_boot_ms[lastIndex] < positions.time_boot_ms[index] &&
                lastIndex < bathymetry.time_boot_ms.length - 1) {
                lastIndex++
            }
            
            if (bathymetry.time_boot_ms[lastIndex] >= positions.time_boot_ms[index]) {
                const lat = positions.Lat[index] * 1e-7
                const lng = positions.Lng[index] * 1e-7
                const depth = bathymetry.Dist[lastIndex]
                
                if (lat !== 0 && lng !== 0 && depth > 0.1) {
                    positionsWithDepth.push({
                        latitude: lat,
                        longitude: lng,
                        depth: depth
                    })
                }
            }
        }
        
        return positionsWithDepth
    }

    filterOutliers(data) {
        // Remove depth outliers using statistical filtering
        const depths = data.map(p => p.depth).filter(d => d > 0.1)
        
        if (depths.length === 0) return []
        
        const mean = depths.reduce((a, b) => a + b, 0) / depths.length
        const stdDev = Math.sqrt(
            depths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / depths.length
        )

        return data.filter(p => {
            return p.depth > 0.1 &&
                   Math.abs(p.depth - mean) < 2.5 * stdDev &&
                   p.latitude !== 0 && 
                   p.longitude !== 0
        })
    }

    generateContours(data) {
        if (data.length < 3) return []

        // Find depth range
        const depths = data.map(p => p.depth)
        const minDepth = Math.min(...depths)
        const maxDepth = Math.max(...depths)
        
        if (minDepth === maxDepth) return []

        // Generate contour levels
        const contourLevels = []
        for (let i = 0; i <= this.options.contourLevels; i++) {
            const level = minDepth + (maxDepth - minDepth) * (i / this.options.contourLevels)
            contourLevels.push(level)
        }

        // Generate contour polygons using marching squares algorithm
        const contours = []
        
        // Create interpolation grid
        const grid = this.createInterpolationGrid(data)
        
        // Generate contour lines for each level
        contourLevels.forEach((level, index) => {
            const contourLines = this.marchingSquares(grid, level)
            
            if (contourLines.length > 0) {
                contours.push({
                    level: level,
                    lines: contourLines,
                    color: this.getDepthColor(level, minDepth, maxDepth),
                    index: index
                })
            }
        })

        return contours
    }

    createInterpolationGrid(data) {
        // Create a regular grid and interpolate depth values
        const bounds = this.getBounds(data)
        const gridSize = 50 // Adjustable resolution
        
        const grid = {
            width: gridSize,
            height: gridSize,
            xMin: bounds.west,
            xMax: bounds.east,
            yMin: bounds.south,
            yMax: bounds.north,
            cellWidth: (bounds.east - bounds.west) / gridSize,
            cellHeight: (bounds.north - bounds.south) / gridSize,
            values: new Array(gridSize * gridSize).fill(null)
        }

        // Interpolate values using inverse distance weighting
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const gridLon = grid.xMin + x * grid.cellWidth
                const gridLat = grid.yMin + y * grid.cellHeight
                
                const interpolatedDepth = this.interpolateDepth(data, gridLon, gridLat)
                grid.values[y * gridSize + x] = interpolatedDepth
            }
        }

        return grid
    }

    interpolateDepth(data, lon, lat) {
        // Inverse distance weighting interpolation
        let totalWeight = 0
        let weightedSum = 0
        const maxDistance = 0.001 // Adjust based on data density

        for (const point of data) {
            const distance = this.haversineDistance(lat, lon, point.latitude, point.longitude)
            
            if (distance < 0.00001) { // Very close point
                return point.depth
            }
            
            if (distance < maxDistance) {
                const weight = 1 / (distance * distance)
                totalWeight += weight
                weightedSum += point.depth * weight
            }
        }

        return totalWeight > 0 ? weightedSum / totalWeight : null
    }

    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3 // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180
        const φ2 = lat2 * Math.PI / 180
        const Δφ = (lat2 - lat1) * Math.PI / 180
        const Δλ = (lon2 - lon1) * Math.PI / 180

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

        return R * c / 1000 // Convert to kilometers
    }

    marchingSquares(grid, level) {
        // Simplified marching squares for contour generation
        const contourLines = []
        
        for (let y = 0; y < grid.height - 1; y++) {
            for (let x = 0; x < grid.width - 1; x++) {
                const cell = this.getGridCell(grid, x, y)
                const lines = this.processGridCell(cell, level, grid, x, y)
                contourLines.push(...lines)
            }
        }
        
        return contourLines
    }

    getGridCell(grid, x, y) {
        return {
            tl: grid.values[y * grid.width + x],           // top-left
            tr: grid.values[y * grid.width + (x + 1)],     // top-right
            bl: grid.values[(y + 1) * grid.width + x],     // bottom-left
            br: grid.values[(y + 1) * grid.width + (x + 1)] // bottom-right
        }
    }

    processGridCell(cell, level, grid, x, y) {
        // Check if any corner values are null
        if (cell.tl === null || cell.tr === null || cell.bl === null || cell.br === null) {
            return []
        }

        // Create case index based on which corners are above/below the level
        let caseIndex = 0
        if (cell.tl >= level) caseIndex += 1
        if (cell.tr >= level) caseIndex += 2
        if (cell.br >= level) caseIndex += 4
        if (cell.bl >= level) caseIndex += 8

        // Generate line segments based on case
        const lines = []
        const cellBounds = {
            left: grid.xMin + x * grid.cellWidth,
            right: grid.xMin + (x + 1) * grid.cellWidth,
            top: grid.yMin + (y + 1) * grid.cellHeight,
            bottom: grid.yMin + y * grid.cellHeight
        }

        // Simplified cases - full implementation would handle all 16 cases
        if (caseIndex === 5 || caseIndex === 10) {
            // Diagonal lines
            lines.push([
                [cellBounds.left, cellBounds.top],
                [cellBounds.right, cellBounds.bottom]
            ])
        }

        return lines
    }

    createContourFeatures(contours) {
        const features = []

        contours.forEach(contour => {
            contour.lines.forEach(line => {
                if (line.length >= 2) {
                    // Convert to map coordinates
                    const coordinates = line.map(coord => fromLonLat([coord[0], coord[1]]))
                    
                    const feature = new Feature({
                        geometry: new LineString(coordinates),
                        type: 'bathymetry-contour',
                        depth: contour.level,
                        contourIndex: contour.index
                    })

                    feature.setStyle(new Style({
                        stroke: new Stroke({
                            color: contour.color,
                            width: this.options.contourWidth
                        })
                    }))

                    features.push(feature)
                }
            })
        })

        return features
    }

    getDepthColor(depth, minDepth, maxDepth) {
        // Color scheme for depth visualization
        const normalized = (depth - minDepth) / (maxDepth - minDepth)
        
        switch (this.options.colorScheme) {
            case 'blue':
                return this.blueScheme(normalized)
            case 'viridis':
                return this.viridisScheme(normalized)
            default:
                return this.blueScheme(normalized)
        }
    }

    blueScheme(normalized) {
        const blue = Math.floor(100 + (155 * (1 - normalized)))
        const green = Math.floor(50 + (100 * (1 - normalized)))
        const red = Math.floor(20 + (80 * (1 - normalized)))
        
        return `rgba(${red}, ${green}, ${blue}, ${this.options.contourOpacity})`
    }

    viridisScheme(normalized) {
        // Viridis color scheme approximation
        const r = Math.floor(255 * (0.267004 + normalized * 0.105782))
        const g = Math.floor(255 * (0.004874 + normalized * 0.967142))
        const b = Math.floor(255 * (0.329415 + normalized * 0.224929))
        
        return `rgba(${r}, ${g}, ${b}, ${this.options.contourOpacity})`
    }

    getBounds(data) {
        const lats = data.map(p => p.latitude)
        const lons = data.map(p => p.longitude)
        
        return {
            north: Math.max(...lats),
            south: Math.min(...lats),
            east: Math.max(...lons),
            west: Math.min(...lons)
        }
    }

    addFeaturesToMap(features) {
        // Implementation depends on how the layer is managed in the main component
        // This would typically be called from the main OpenLayersViewer component
        return features
    }

    clear() {
        this.contourFeatures = []
        this.hullFeature = null
        this.depthData = []
    }
}
