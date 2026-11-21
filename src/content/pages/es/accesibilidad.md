---
lang: "es"
slug: "accesibilidad"
title: "Declaración de accesibilidad"
draft: false
---
Hyperborea. Revista de ensayo y creación quiere que su sitio web pueda usarse sin barreras: con teclado, con lector de pantalla, con ampliación de texto o de pantalla y con los modos de alto contraste. Esta declaración dice qué hacemos, qué sabemos que todavía falla y cómo avisarnos de una barrera.

## Estado de conformidad

El objetivo es cumplir las [Pautas de Accesibilidad para el Contenido Web (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) en el nivel AA. **Estado actual: conformidad parcial.** Las comprobaciones automáticas se ejecutan en cada cambio y hoy no encuentran incumplimientos; falta completar la evaluación manual con lectores de pantalla y otras tecnologías de apoyo, y los contenidos importados del sitio anterior tienen las limitaciones que se detallan más abajo.

## Qué hacemos

- **Pruebas en cada cambio.** Antes de publicar cualquier modificación se ejecutan, de forma automática, la herramienta axe-core con las reglas WCAG 2.0, 2.1 y 2.2 (niveles A y AA) y buenas prácticas sobre una muestra fija de veinte páginas en los tres idiomas, la validación del HTML de todas las páginas y comprobaciones de estructura: un solo título principal, textos alternativos en todas las imágenes, idioma declarado y enlace «Pasar al contenido principal» como primer elemento.
- **Teclado.** Todo se puede usar con el teclado. El foco es siempre visible y la cabecera fija no lo tapa. El submenú se abre con Enter o Espacio y se cierra con Esc.
- **Contraste y color.** Los textos y los bordes de los controles cumplen las relaciones de contraste 4,5:1 y 3:1. Los enlaces dentro del texto van subrayados y no se distinguen solo por el color.
- **Adaptación.** El contenido se reorganiza hasta 320 píxeles de ancho sin scroll horizontal, tolera el espaciado de texto ampliado, respeta la preferencia de movimiento reducido y el modo de alto contraste forzado de Windows.
- **Idiomas.** Cada texto declara su idioma. Los textos que solo existen en español se muestran como tales en las versiones inglesa y francesa, con su idioma indicado, para que los lectores de pantalla los pronuncien bien.

## Limitaciones conocidas

- **Imágenes dentro de los textos.** Los trabajos importados del sitio anterior tienen 258 imágenes en el cuerpo del texto. Todas llevan descripción, pero 43 tienen una genérica del tipo «Figura 4», que identifica la imagen sin describirla.
- **Imágenes destacadas.** Se tratan como decorativas, porque el título ya está al lado, salvo que la redacción cargue una descripción.
- **Archivos PDF.** Muchos trabajos se ofrecen también en PDF. No garantizamos que esos archivos estén etiquetados ni que su texto sea seleccionable: algunos pueden ser escaneos. El texto completo está siempre en la propia página.
- **Logotipo.** El logotipo de la cabecera es una imagen de baja resolución y se ve borroso en pantallas de alta densidad. Está previsto reemplazarlo por uno vectorial.
- **Evaluación manual pendiente.** Todavía no hemos completado pruebas con lectores de pantalla (como VoiceOver, NVDA o TalkBack) ni con ampliadores y software de dictado.

## Cómo avisarnos de una barrera

Si algo no se puede leer o usar, escríbanos a [admin@microagencia.com](mailto:admin@microagencia.com). Indique la dirección de la página, qué problema encontró y, si lo desea, qué tecnología de apoyo usa. Responderemos lo antes posible y, si el contenido no se puede arreglar de inmediato, le ofreceremos una alternativa.

## Fecha y revisión

Esta declaración se preparó el 21 de noviembre de 2026. La revisaremos al menos una vez al año y cada vez que haya un cambio importante en el sitio.
