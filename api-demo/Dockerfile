FROM nginx:alpine

COPY ./public /usr/share/nginx/html

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV CC_ORIGIN=https://citycatalyst.io/
ENV CLIENT_ID=doesnotexist

EXPOSE 80

CMD ["/bin/sh", "-c", "/entrypoint.sh"]