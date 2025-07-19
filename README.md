# OpenUAS Log Viewer

![log seeking](preview.gif "Logo Title Text 1")

## Forked project of UAV Log Viewer by ArduPilot
[UAV Log Viewer](https://github.com/ArduPilot/UAVLogViewer)

 This is a Javascript based log viewer for Mavlink telemetry and dataflash logs.
 
 **🚀 [Live deployment: https://openuaslogviewer.com](https://openuaslogviewer.com)**
 
 [Original ArduPilot demo](http://plot.ardupilot.org)

### Project Goals:
* Extend functionality to include parsed DJI flight logs.
* Allow for manual input of GPS coordinate arrays for unsupported logs formats.
* Offline mapping using predownloaded tiles
* Visual planes showing objects detected by on-board obstacle avoidance sensors.
* Georeferencing images and videos during playback
* Report generation highlighting key events and flight details.

## Build Setup

``` bash
# requires:
# - node:14
# - Visual Studio w/ C++ workload (or equivalent build tools)
# install dependencies
npm install

# serve with hot reload at localhost:8080
npm run dev

# build for production with minification
npm run build

# run unit tests
npm run unit

# run e2e tests
npm run e2e

# run all tests
npm test
```

## Configuration

### Map Visualization

The application currently uses OpenLayers for 2D mapping and visualization. This provides:
- Better performance and smaller bundle size
- Improved mobile device compatibility
- Wide variety of free map providers
- Better web standards compliance

The migration from Cesium to OpenLayers has been completed while maintaining all core functionality.

#### Future 3D Visualization Plans

We are planning to implement Three.js for advanced 3D flight path visualization to address commercial licensing limitations with Cesium. This will enable:

- **3D Flight Path Rendering**: Adjustable camera angles and perspectives for drone flight analysis
- **Offline 3D Mapping**: Support for predownloaded tiles and terrain data without API dependencies
- **Obstacle Avoidance Visualization**: 3D rendering of detected objects and sensor data
- **Georeferenced Media Playback**: Images and videos mapped to 3D coordinates during flight replay
- **Enhanced Report Generation**: 3D scene exports and visualizations for detailed flight analysis
- **Commercial Use Freedom**: No licensing restrictions or API limits for professional users

This approach will provide both 2D (OpenLayers) and 3D (Three.js) viewing options while maintaining complete open-source freedom.

# Docker

``` bash

# Build Docker Image
docker build -t <your username>/uavlogviewer .

# Run Docker Image
docker run -p 8080:8080 -d <your username>/uavlogviewer

# View Running Containers
docker ps

# View Container Log
docker logs <container id>

# Navigate to localhost:8080 in your web browser

```
