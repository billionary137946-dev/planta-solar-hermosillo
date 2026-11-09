# Planta Solar Híbrida · Render 3D de construcción

Render interactivo en el navegador del proyecto **Planta Solar Híbrida (300 → 500 MW, México)**:
secuencia de construcción por etapas, navegación por zonas y recorrido automático de cámara.

## Ver el render

**Opción 1 — sin servidor (offline)**
Abre `index.html` con doble clic. Funciona sin internet: Three.js está incluido en el repositorio
(`three.min.js`), no hay CDN ni peticiones externas.

**Opción 2 — servidor local**
```bash
python serve.py          # http://127.0.0.1:8123
python serve.py 8080     # otro puerto
```
`serve.py` envía `charset=utf-8` explícito y desactiva la caché, para que el español se vea
siempre correcto.

**Opción 3 — compartir en la red local**
```bash
python serve.py 8123
```
y abrir `http://TU-IP-LOCAL:8123` desde otro equipo en la misma red (puede requerir permitir
Python en el firewall de Windows).

## Controles

| Acción | Resultado |
|---|---|
| Botón **▶** / deslizador | Reproduce o recorre la secuencia de construcción |
| Chips de etapa (01–14) | Salta a esa etapa del proyecto |
| Riel de zonas (derecha) | Vuela a la zona y abre su ficha |
| Pines numerados 1–6 | Van a la zona exacta en la escena 3D |
| **AUTO / LIBRE** | Activa o desactiva el recorrido automático de cámara |
| Arrastrar / rueda / pinza | Orbita y acerca (desactiva AUTO) |
| Deslizador **Hora local** | Cambia la iluminación (amanecer → noche) |
| **Resumen ejecutivo** | Abre el resumen para inversionistas |

## Adaptación de pantalla

Tres modos automáticos según ancho **y** altura:

- **Escritorio** (> 980 px y ≥ 720 px de alto): KPIs en columna, riel vertical de zonas.
- **Compacto** (≤ 980 px o < 720 px): KPIs en tira horizontal y riel de zonas horizontal.
- **Muy bajo** (< 560 px / < 440 px): se ocultan riel y KPIs para priorizar la escena 3D.

Incluye áreas seguras para muescas y blancos de toque ampliados en pantallas táctiles.

## Estructura

```
index.html      estructura y textos (UTF-8)
styles.css      interfaz de vidrio, breakpoints y adaptación
app.js          escena Three.js, construcción por etapas, zonas y director de cámara
three.min.js    Three.js r147 (local, sin CDN)
serve.py        servidor local con charset utf-8
```

## Nota

Propuesta conceptual preliminar. La información del resumen ejecutivo es confidencial y no
constituye oferta ni contrato. Fuente: `Solar_Plant_Executive_Summary_v2.pdf`.
