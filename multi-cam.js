const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
require("dotenv").config();
const request = require('request');
const fs = require('fs');
const bodyParser = require('body-parser');
const multer = require('multer');
const stream = require('stream');
const path = require('path');
const upload = multer({ storage: multer.memoryStorage() });
const ejs = require("ejs");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('assets'));
app.set('view engine', 'ejs');
const server = http.createServer(app);


// Leer las cámaras del archivo .env
const { CAMERAS, PORT, RECONNECT_TIMEOUT_SECONDS } = process.env;


app.post('/addPerson', async (req, res) => {
    try {
        let imageSize;
        let imageBuffer;

        // Obtener el nombre de la cámara del cuerpo de la solicitud
        const cameraName = req.body.cameraName;

        // Buscar la configuración de la cámara por su nombre en el array CAMERAS
        const cameraConfig = getCameraConfig(cameraName);

        // Verificar si se encontró la configuración de la cámara
        if (!cameraConfig) {
            console.error(`No se encontró ninguna configuración para la cámara con el nombre: ${cameraName}`);
            return res.status(404).send('No se encontró ninguna configuración para la cámara especificada.');
        }

        // Construir la URL de la solicitud utilizando la configuración de la cámara
        const cameraUrl = `http://${cameraConfig.host}:${cameraConfig.port}/cgi-bin/faceRecognitionServer.cgi?action=addPerson&groupID=1&name=${req.body.name}&certificateType=IC&id=${req.body.id}`;



        // Manejar imagen desde URL
        try {
            imageBuffer = await axios.get(req.body.imageUrl, { responseType: "arraybuffer" });
            imageSize = imageBuffer.data.length; // Tamaño de la imagen en bytes
        } catch (downloadError) {
            console.error('Error al descargar la imagen:', downloadError);
            return res.status(500).send('Error al descargar la imagen.');
        }
        // Opciones para la solicitud
        const options = {
            method: 'POST',
            url: cameraUrl,
            headers: {
                'Content-Type': 'image/jpeg',
                'Content-Length': imageSize
            },
            body: imageBuffer.data
        };

        request(options, function (error, response, body) {
            if (error) {
                console.error('Error al realizar la solicitud:', error);
                return res.status(500).send('Error interno del servidor al realizar la solicitud.');
            }
            // También podrías querer verificar el código de estado HTTP de la respuesta aquí
            if (response.statusCode >= 400) {
                console.error('Respuesta de error del servidor remoto:', body);
                return res.status(response.statusCode).send(body);
            }
            const responseText = body.trim().split('\r\n');
            const parsedObject = {};

            responseText.forEach(line => {
                // Descompone la línea en clave y valor
                let [key, value] = line.split('=');
                // Convierte "true" y "false" a booleanos, y intenta convertir números
                if (value === "true") value = true;
                if (value === "false") value = false;
                if (!isNaN(value) && value !== "") value = Number(value);

                // Navega y construye la estructura del objeto según la clave
                const parts = key.split('.');
                let current = parsedObject;
                parts.forEach((part, index) => {
                    // Verifica si es parte de un array
                    const match = part.match(/([a-zA-Z]+)\[([0-9]+)\]/);
                    if (match) {
                        const [, arrayName, arrayIndex] = match;
                        current[arrayName] = current[arrayName] || []; // Asegura que el array exista
                        current[arrayName][arrayIndex] = current[arrayName][arrayIndex] || {}; // Asegura que el objeto en el índice exista
                        if (index === parts.length - 1) {
                            current[arrayName][arrayIndex] = value; // Asigna el valor si es el final
                        } else {
                            current = current[arrayName][arrayIndex]; // De lo contrario, continúa construyendo dentro de este objeto
                        }
                    } else {
                        if (index === parts.length - 1) {
                            current[part] = value; // Asigna el valor si es el final
                        } else {
                            current[part] = current[part] || {}; // Asegura que el objeto exista
                            current = current[part]; // Continúa construyendo dentro de este objeto
                        }
                    }
                });
            });

            console.log('Respuesta exitosa del servidor:', JSON.parse(JSON.stringify(parsedObject, null, 2)));
            res.send(JSON.parse(JSON.stringify(parsedObject, null, 2)));
        }).auth(process.env.CAM_USER, process.env.CAM_PASS, false);

    } catch (error) {
        console.error('Error to Request New Person: ', error);
        res.status(500).send('Error interno del servidor.');
    }
});


// Función para conectarse a las cámaras y suscribirse a los eventos
function connectToCameras() {

    JSON.parse(CAMERAS).forEach(camera => {
        const opts = {
            'url': `http://${camera.host}:${camera.port}/cgi-bin/eventManager.cgi?action=attach&codes=[${camera.events}]`,
            'forever': true,
            'headers': {
                'Accept': 'multipart/x-mixed-replace',
                'Content-Type': 'application/json'
            }
        };

        const client = request(opts).auth(camera.username, camera.password, false);

        client.on('socket', function (socket) {
            socket.setKeepAlive(true, 1000);
            console.log(`Socket initialized for camera: ${camera.name}`);
        });

        client.on('response', function () {
            console.log(`Connected to camera: ${camera.name}`);
        });

        client.on('data', function (response) {
            handleDahuaEventData(response, camera.name);
        });

        client.on('error', function (err) {
            console.error(`Error connecting to camera: ${camera.name}`, err);
        });

        client.on('close', function () {
            console.error(`Connection closed for camera: ${camera.name} - reconnecting in ${RECONNECT_TIMEOUT_SECONDS} seconds...`);
        });
    });
}

// Función para manejar los eventos recibidos de las cámaras
function handleDahuaEventData(data, cameraHost) {
    const jsonFile = './face.json';
    data = data.toString().split('\r\n');
    var i = Object.keys(data);
    i.forEach(function (id) {
        if (data[id].startsWith('Code=')) {
            var responseText = data[id].toString();
            const startIndex = responseText.indexOf('data={') + 'data={'.length;
            const endIndex = responseText.indexOf('"Face" : {', startIndex);
            let jsonString = responseText.substring(startIndex, endIndex).trim();
            jsonString = jsonString.endsWith(',') ? jsonString.substring(0, jsonString.length - 1) : jsonString;
            jsonString = "{" + jsonString + "}";

            try {
                const jsonObject = JSON.parse(jsonString);
                jsonObject.cameraHost = cameraHost; // Agregar el host de la cámara al objeto JSON

                // Leer el archivo actual, parsear a un array, añadir el nuevo objeto y volver a escribirlo
                fs.readFile(jsonFile, (err, data) => {
                    let json = [];
                    if (!err && data.length) {
                        try {
                            json = JSON.parse(data.toString());
                        } catch (parseError) {
                            console.error("Error al parsear el JSON existente:", parseError);
                            return;
                        }
                    }

                    json.push(jsonObject);

                    fs.writeFile(jsonFile, JSON.stringify(json, null, 2), (writeError) => {
                        if (writeError) {
                            console.error("Error al escribir en el archivo:", writeError);
                        } else {
                            console.log("JSON añadido al archivo face.json exitosamente.");
                        }
                    });
                });

            } catch (parseError) {
                console.error("Error al parsear el JSON:", parseError);
            }
        }
    });
}

function getCameraConfig(cameraName){
    const camConfig = JSON.parse(CAMERAS).find(camera => camera.name === cameraName);
    return camConfig;
}

// Conectar a las cámaras y suscribirse a los eventos
connectToCameras();


server.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));