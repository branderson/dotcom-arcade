FROM eclipse-temurin:8-jdk AS applet-support
COPY applet-support /src
RUN mkdir /classes && \
  javac -d /classes $(find /src -name '*.java') && \
  jar cfm /applet-support.jar /src/MANIFEST.MF -C /classes .

FROM ghcr.io/linuxserver/baseimage-selkies:debiantrixie

RUN apt-get update && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    cpulimit \
    fontconfig \
    fonts-dejavu-core \
    libasound2-plugins \
    libfontconfig1 \
    libfreetype6 \
    libgl1 \
    libgtk2.0-0t64 \
    libnss3 \
    libpulse0 \
    libx11-6 \
    libxcomposite1 \
    libxcursor1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxinerama1 \
    libxrandr2 \
    libxrender1 \
    libxtst6 \
    libxxf86vm1 \
    sqlite3 \
    x11-utils \
    xdotool && \
  rm -rf /var/lib/apt/lists/*

COPY root/ /
COPY --from=applet-support /applet-support.jar /opt/flashpoint/applet-support.jar
