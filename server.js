const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------------------------------------------------
// CONFIGURACIÓN DE CREDENCIALES (Variables de entorno)
// -------------------------------------------------------------
const CLAVE_ADMIN = process.env.CLAVE_ADMIN || "MiClaveSegura2026";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://lcsvlalxmwkxqgrvpsgp.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'xarzm0aa',
  api_key:    process.env.CLOUDINARY_API_KEY || '485674699815882',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'uPfqYW0ITWbP8k1QTnrYSTLDMLk'
});
// -------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 1. REGISTRAR LOCATARIO
app.post('/api/registrar', upload.single('foto'), async (req, res) => {
  try {
    const { nombre, local, identificacion, mes_activo, clave } = req.body;

    if (clave !== CLAVE_ADMIN) {
      return res.status(401).json({ error: 'Clave de administración incorrecta.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Debes adjuntar una fotografía.' });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'sistema-banos' },
      async (error, result) => {
        if (error) return res.status(500).json({ error: 'Error al subir la imagen a Cloudinary.' });

        const token = 'LOC-' + Math.random().toString(36).substr(2, 8).toUpperCase();
        const fotoUrl = result.secure_url;

        const { data, error: dbError } = await supabase
          .from('locatarios')
          .insert([{ token, nombre, local, identificacion, foto: fotoUrl, mes_activo, activo: 1 }])
          .select();

        if (dbError) return res.status(500).json({ error: dbError.message });

        const host = req.get('host');
        const protocol = req.protocol;
        const validacionUrl = `${protocol}://${host}/validar.html?token=${token}`;
        const qrImage = await QRCode.toDataURL(validacionUrl);

        res.json({
          success: true,
          data: { id: data[0].id, token, nombre, local, identificacion, foto: fotoUrl, mes_activo, qrImage }
        });
      }
    );

    uploadStream.end(req.file.buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 2. LISTAR LOCATARIOS
app.get('/api/locatarios', async (req, res) => {
  const { data, error } = await supabase.from('locatarios').select('*').order('id', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 3. RENOVAR O DESACTIVAR MES
app.post('/api/renovar', async (req, res) => {
  const { id, mes_activo, activo, clave } = req.body;
  if (clave !== CLAVE_ADMIN) return res.status(401).json({ error: 'Clave incorrecta' });

  const { error } = await supabase
    .from('locatarios')
    .update({ mes_activo, activo })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// 4. BORRAR REGISTRO
app.delete('/api/locatarios/:id', async (req, res) => {
  const { id } = req.params;
  const clave = req.headers['x-admin-key'];
  if (clave !== CLAVE_ADMIN) return res.status(401).json({ error: 'Clave incorrecta' });

  const { error } = await supabase.from('locatarios').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// 5. CONSULTA DE VALIDACIÓN
app.get('/api/validar/:token', async (req, res) => {
  const { token } = req.params;
  const { data, error } = await supabase.from('locatarios').select('*').eq('token', token).single();

  if (error || !data) return res.status(404).json({ valido: false, mensaje: 'Credencial No Registrada' });

  res.json({
    valido: data.activo === 1,
    locatario: data
  });
});

app.listen(PORT, () => console.log(`Servidor iniciado correctamente en puerto ${PORT}`));
