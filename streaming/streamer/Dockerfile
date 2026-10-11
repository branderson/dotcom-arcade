FROM eclipse-temurin:8-jdk AS applet-support
COPY applet-support /src
RUN mkdir /classes && \
  javac -d /classes $(find /src -name '*.java') && \
  jar cfm /applet-support.jar /src/MANIFEST.MF -C /classes .

FROM ghcr.io/linuxserver/baseimage-selkies:debiantrixie

RUN apt-get update && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-dejavu-core \
    libasound2-plugins \
    libxi6 \
    libxrender1 \
    libxtst6 \
    sqlite3 && \
  rm -rf /var/lib/apt/lists/*

COPY root/ /
COPY --from=applet-support /applet-support.jar /opt/flashpoint/applet-support.jar
