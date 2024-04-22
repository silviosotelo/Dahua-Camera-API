const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const upload = multer({ storage: multer.memoryStorage() });
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de la aplicación
const { CAM_HOST, CAM_PORT, CAM_USER, CAM_PASS } = process.env;

app.post('/addPerson', upload.single('image'), async (req, res) => {
    try {
        let imageBuffer;
        if (req.file) {
            // Manejo de imagen cargada directamente
            imageBuffer = req.file.buffer;
        } else if (req.body.imageUrl) {
            // Manejo de imagen desde URL
            try {
                const response = await axios.get(req.body.imageUrl, { responseType: 'arraybuffer' });
                imageBuffer = Buffer.from(response.data, 'binary');
            } catch (error) {
                console.error('Error al descargar la imagen:', error);
                return res.status(500).json({ error: 'Error al descargar la imagen.' });
            }
        } else {
            return res.status(400).json({ error: 'No se proporcionó imagen.' });
        }

        const response = await axios.post(
            `http://${CAM_HOST}:${CAM_PORT}/cgi-bin/faceRecognitionServer.cgi?action=addPerson&groupID=1&name=${req.body.name}&certificateType=IC&id=${req.body.id}`,
            {},
            {
                auth: {
                    username: CAM_USER,
                    password: CAM_PASS
                },
                headers: {
                    'Content-Type': 'image/jpeg',
                    'Content-Length': imageBuffer.length
                }
            }
        );
        console.log(response.headers);

        console.log('Respuesta exitosa del servidor:', response.data);
        res.json(response.data);
    } catch (error) {
        console.error('Error al agregar la persona:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
});