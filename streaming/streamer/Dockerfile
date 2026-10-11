FROM eclipse-temurin:8-jdk AS jsobject
COPY jsobject /src
RUN mkdir /classes && \
  javac -d /classes $(find /src -name '*.java') && \
  jar cf /jsobject.jar -C /classes .

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
COPY --from=jsobject /jsobject.jar /opt/flashpoint/jsobject.jar
