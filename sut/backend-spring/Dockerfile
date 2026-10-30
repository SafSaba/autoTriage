FROM autotriage-backend:latest
WORKDIR /app
COPY agent.jar /app/agent.jar
COPY target/shop-0.1.0-SNAPSHOT.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-javaagent:/app/agent.jar", "-jar", "app.jar"]


