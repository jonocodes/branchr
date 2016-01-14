FROM meteorhacks/meteord:devbuild

# COPY app/ app

ADD https://get.docker.com/builds/Linux/i386/docker-latest /usr/bin/docker
ADD https://github.com/docker/compose/releases/download/1.5.2/docker-compose-Linux-x86_64 /usr/local/bin/docker-compose

RUN chmod +x /usr/bin/docker /usr/local/bin/docker-compose
