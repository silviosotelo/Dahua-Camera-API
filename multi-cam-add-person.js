const express = require('express');
const app = express();
const axios = require('axios');
const request = require('request');
const bodyParser = require('body-parser');
require('dotenv').config();

app.use(bodyParser.json());

// Definir CAMERAS desde process.env
const CAMERAS = JSON.parse(process.env.CAMERAS);

app.post('/addPerson', async (req, res) => {
    try {
        let imageBuffer;
        let imageSize;

        // Obtener el nombre de la cámara del cuerpo de la solicitud
        const cameraName = req.body.cameraName;

        // Manejar imagen desde URL
        try {
            imageBuffer = await axios.get(req.body.imageUrl, { responseType: "arraybuffer" });
            imageSize = imageBuffer.data.length; // Tamaño de la imagen en bytes
        } catch (downloadError) {
            console.error('Error al descargar la imagen:', downloadError);
            return res.status(500).send('Error al descargar la imagen.');
        }

        // Si no se le envía el parámetro del nombre de la cámara, recorre todas las cámaras
        if (!cameraName) {
            const cameraPromises = CAMERAS.map(camera => addPersonToCamera(req.body, camera, imageBuffer, imageSize));
            await Promise.all(cameraPromises);
            res.send('Person added to all cameras successfully');
        } else {
            // Buscar la configuración de la cámara específica
            const camera = CAMERAS.find(cam => cam.name === cameraName);

            if (camera) {
                await addPersonToCamera(req.body, camera, imageBuffer, imageSize);
                res.send(`Person added to camera ${cameraName} successfully`);
            } else {
                res.status(400).send('Cámara no encontrada');
            }
        }
    } catch (error) {
        console.error('Error to Request New Person: ', error);
        res.status(500).send('Error interno del servidor.');
    }
});

// Función para agregar una persona a una cámara específica
async function addPersonToCamera(body, camera, imageBuffer, imageSize) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'POST',
            url: `http://${camera.host}:${camera.port}/cgi-bin/faceRecognitionServer.cgi?action=addPerson&groupID=1&name=${body.name}&certificateType=IC&id=${body.id}`,
            headers: {
                'Content-Type': 'image/jpeg',
                'Content-Length': imageSize
            },
            body: imageBuffer.data
        };

        request(options, function (error, response, body) {
            if (error) {
                console.error('Error al realizar la solicitud:', error);
                reject('Error interno del servidor al realizar la solicitud.');
                return;
            }
            if (response.statusCode >= 400) {
                console.error('Respuesta de error del servidor remoto:', body);
                reject(body);
                return;
            }
            console.log('Reponse Person Headers:', response.headers);
            const responseText = body.trim().split('\r\n');
            const parsedObject = {};

            responseText.forEach(line => {
                let [key, value] = line.split('=');
                if (value === "true") value = true;
                if (value === "false") value = false;
                if (!isNaN(value) && value !== "") value = Number(value);

                const parts = key.split('.');
                let current = parsedObject;
                parts.forEach((part, index) => {
                    const match = part.match(/([a-zA-Z]+)\[([0-9]+)\]/);
                    if (match) {
                        const [, arrayName, arrayIndex] = match;
                        current[arrayName] = current[arrayName] || [];
                        current[arrayName][arrayIndex] = current[arrayName][arrayIndex] || {};
                        if (index === parts.length - 1) {
                            current[arrayName][arrayIndex] = value;
                        } else {
                            current = current[arrayName][arrayIndex];
                        }
                    } else {
                        if (index === parts.length - 1) {
                            current[part] = value;
                        } else {
                            current[part] = current[part] || {};
                            current = current[part];
                        }
                    }
                });
            });

            console.log('Respuesta exitosa del servidor:', JSON.parse(JSON.stringify(parsedObject, null, 2)));
            resolve();
        }).auth(camera.username, camera.password, false);
    });
}

// Inicia el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
