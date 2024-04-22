const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
require("dotenv").config();
const request = require('request');
const fs = require('fs');
const bodyParser = require('body-parser');
const base64 = require('base-64');
const utf8 = require('utf8');
const multer = require('multer');
const stream = require('stream');
const path = require('path');
const upload = multer({ storage: multer.memoryStorage() });
const ejs = require("ejs");





const app = express();
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static('assets'));
//app.use('/static', express.static('assets'));
// Establecer el motor de plantillas a EJS
app.set('view engine', 'ejs');
const PORT = process.env.PORT || 3300;
const server = http.createServer(app);
const io = socketIo(server);

var connected = false;
var RECONNECT_TIMEOUT_SECONDS = 10;
var eventNames = [
    //'All'
    'FaceRecognition'
];
var opts = {
    'url': `http://${process.env.CAM_HOST}:${process.env.CAM_PORT}/cgi-bin/eventManager.cgi?action=attach&codes=[${eventNames.join(',')}]`,
    'forever': true,
    'headers': {
        'Accept': 'multipart/x-mixed-replace',
        'Content-Type': 'application/json'
    }
};



app.get('/', (req, res) => {
    res.render('index', {
        url: `rtsp://${process.env.CAM_USER}:${process.env.CAM_PASS}@${process.env.CAM_HOST}:554/cam/realmonitor?channel=${process.env.CAM_CHANNEL}&subtype=1`
    });
});

app.post('/addPerson', upload.single('image'), async (req, res) => {
    try {
        let imageSize;
        let imageBuffer;
        let imageUrl = req.body.imageUrl;

        if (req.file) {
            // Manejar imagen cargada directamente
            imageBuffer = req.file.buffer;

        } else if (imageUrl) {
            // Manejar imagen desde URL
            try {
                imageBuffer = await axios.get(imageUrl, { responseType: "arraybuffer" });
                imageSize = imageBuffer.data.length; // Tamaño de la imagen en bytes
            } catch (downloadError) {
                console.error('Error al descargar la imagen:', downloadError);
                return res.status(500).send('Error al descargar la imagen.');
            }
        } else {
            return res.status(400).send('No se proporcionó imagen.');
        }
        // Opciones para la solicitud
        const options = {
            method: 'POST',
            url: `http://${process.env.CAM_HOST}:${process.env.CAM_PORT}/cgi-bin/faceRecognitionServer.cgi?action=addPerson&groupID=1&name=${req.body.name}&certificateType=IC&id=${req.body.id}`,
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
            console.log('Reponse Person Headers:', response.headers);
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

app.get('/findPerson', (req, res) => {

    var opts = {
        'method': 'GET',
        'url': `http://${process.env.CAM_HOST}:${process.env.CAM_PORT}/cgi-bin/faceRecognitionServer.cgi?action=startFind&condition.GroupID[0]=1&person.ID=${req.body.id}`,
        'forever': true,
        'headers': {
            'Accept': 'multipart/x-mixed-replace',
            'Content-Type': 'application/json'
        }
    };
    request(opts, function (error, response, body) {
        if (error) {
            console.error('Error al realizar la solicitud:', error);
            return res.status(500).send('Error interno del servidor al realizar la solicitud.');
        }
        // También podrías querer verificar el código de estado HTTP de la respuesta aquí
        if (response.statusCode >= 400) {
            console.error('Respuesta de error del servidor remoto:', body);
            return res.status(response.statusCode).send(body);
        }
        console.log('Reponse Token Headers:', response.headers);
        const responseText = body.trim().split('\n');
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
        const token = JSON.parse(JSON.stringify(parsedObject, null, 2)).token;
        console.log('Token:', token);


        var opts1 = {
            'method': 'GET',
            'url': `http://${process.env.CAM_HOST}:${process.env.CAM_PORT}/cgi-bin/faceRecognitionServer.cgi?action=doFind&token=${token}&index=0`,
            'forever': true,
            'headers': {
                'Accept': 'multipart/x-mixed-replace',
                'Content-Type': 'application/json'
            }
        };
        request(opts1, function (error, response, body) {
            if (error) {
                console.error('Error al realizar la solicitud:', error);
                return res.status(500).send('Error interno del servidor al realizar la solicitud.');
            }
            // También podrías querer verificar el código de estado HTTP de la respuesta aquí
            if (response.statusCode >= 400) {
                console.error('Respuesta de error del servidor remoto:', body);
                console.error('Response Headers:', response.headers);
                return res.status(response.statusCode).send(body);
            }

            console.log('Person Finded: ', body);

            const responseText = body.trim().split('\n');
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
            //const token = JSON.parse(JSON.stringify(parsedObject, null, 2)).token;
            //console.log('Respuesta exitosa del servidor:', token);
            res.send(JSON.parse(JSON.stringify(parsedObject, null, 2)));
        }).auth(process.env.CAM_USER, process.env.CAM_PASS, false);
    }).auth(process.env.CAM_USER, process.env.CAM_PASS, false);
});

app.get('/findGroup', (req, res) => {
    const bytes = utf8.encode(`${process.env.CAM_USER}:${process.env.CAM_PASS}`);
    const encoded = base64.encode(bytes);
    var opts = {
        method: 'GET',
        url: `http://${process.env.CAM_HOST}:${process.env.CAM_PORT}/cgi-bin/faceRecognitionServer.cgi?action=findGroup`,
        headers: {
            'Accept': 'multipart/x-mixed-replace',
            'Content-Type': 'application/json'
        }
    };
    request(opts, function (error, response, body) {
        if (error) {
            console.error('Error al realizar la solicitud:', error);
            return res.status(500).send('Error interno del servidor al realizar la solicitud.');
        }
        // También podrías querer verificar el código de estado HTTP de la respuesta aquí
        if (response.statusCode >= 400) {
            console.error('Respuesta de error del servidor remoto:', body);
            return res.status(response.statusCode).send(body);
        }
        console.log('Reponse Token Headers:', response.headers);
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

});

app.get('/snapShot', (req, res) => {
    var opts = {
        method: 'GET',
        url: `http://${process.env.CAM_HOST}:${process.env.CAM_PORT}/cgi-bin/snapshot.cgi?channel=${process.env.CAM_CHANNEL}`,
        headers: {
            'Accept': 'multipart/x-mixed-replace',
            'Content-Type': 'image/jpeg' // Establecer el tipo de contenido a imagen/jpeg
        }
    };

    // Hacer la solicitud a la cámara
    var requestStream = request(opts, function (error, response, body) {
        if (error) {
            console.error('Error al realizar la solicitud:', error);
            return res.status(500).send('Error interno del servidor al realizar la solicitud.');
        }
        // También podrías querer verificar el código de estado HTTP de la respuesta aquí
        if (response.statusCode >= 400) {
            console.error('Respuesta de error del servidor remoto:', body);
            return res.status(response.statusCode).send(body);
        }
    }).auth(process.env.CAM_USER, process.env.CAM_PASS, false);

    // Pipe el stream de la respuesta de la cámara a la respuesta de Express
    requestStream.pipe(res);
});



var client = request(opts).auth(process.env.CAM_USER, process.env.CAM_PASS, false);

client.on('socket', function (socket) {
    socket.setKeepAlive(true, 1000);
    console.log('Socket Initialized...');
});

client.on('response', function () {
    connected = true;
    console.log(`Connected to CAM: ${process.env.CAM_USER}:${process.env.CAM_PASS}@${process.env.CAM_HOST} `);
    client.emit('camConnected', {
        'CAM_HOST': process.env.CAM_HOST, 'CAM_USER': process.env.CAM_USER
    });
});

client.on('data', function (response) {
    handleDahuaEventData(response);
});

client.on('error', function (err) {
    if (!connected) {
        console.error("Connection closed- reconnecting in " + RECONNECT_TIMEOUT_SECONDS + " seconds...");
    }
});

client.on('close', function () {
    connected = false;
    console.error("Connection closed- reconnecting in " + RECONNECT_TIMEOUT_SECONDS + " seconds...");
});


function handleDahuaEventData(data) {
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
                ///console.log("JSON extraído:", jsonObject);

                // Leer el archivo actual, parsearlo a un array, añadir el nuevo objeto y volver a escribirlo
                fs.readFile(jsonFile, (err, data) => {
                    let json = [];
                    if (!err && data.length) {
                        // Parsea el contenido existente si hay alguno y no hay errores
                        try {
                            json = JSON.parse(data.toString());
                        } catch (parseError) {
                            console.error("Error al parsear el JSON existente:", parseError);
                            return;
                        }
                    }

                    // Añade el nuevo objeto al array
                    json.push(jsonObject);

                    // Vuelve a escribir el archivo JSON con el nuevo array de objetos
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

server.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));
