#!/bin/bash

# Create a directory for ffmpeg
mkdir -p bin

# Download ffmpeg static build for Linux x86_64
wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
tar xf ffmpeg-release-amd64-static.tar.xz
mv ffmpeg-*-amd64-static/ffmpeg bin/
mv ffmpeg-*-amd64-static/ffprobe bin/
rm -rf ffmpeg-*-amd64-static ffmpeg-release-amd64-static.tar.xz

# Make the binaries executable
chmod +x bin/ffmpeg
chmod +x bin/ffprobe 