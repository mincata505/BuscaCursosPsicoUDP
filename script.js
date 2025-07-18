(function() { // Encapsulamos todo en una IIFE (función que se ejecuta inmediatamente)

// Definimos los nombres de los archivos CSV que queremos cargar
const csvFiles = [
    'PSICOLOGIA_1_Procesado.csv',
    'FORMACION_GENERAL_Procesado.csv',
    'CFG_DEPORTIVOS_Procesado.csv'
];

let allCourses = []; // Guarda todos los cursos cargados
let selectedCourses = []; // Guarda los cursos que el usuario ha seleccionado

// Referencias a elementos HTML por su ID
const cursosContainer = document.getElementById('cursosContainer');
const horarioGrid = document.getElementById('horarioGrid');
const topesAlert = document.getElementById('topesAlert');
const totalCreditsDisplay = document.getElementById('totalCredits');
const filtroCursoInput = document.getElementById('filtroCurso');
const clearScheduleBtn = document.getElementById('clearScheduleBtn');
const exportImageBtn = document.getElementById('exportImageBtn');
const filtroCategoriaSelect = document.getElementById('filtroCategoria');

// Mapeo de días de la semana para CSS Grid (columna 1 = Lunes, etc.)
const daysMap = {
    'Lunes': 1, 'Martes': 2, 'Miércoles': 3, 'Miercoles': 3, 'Jueves': 4, 'Viernes': 5
};
const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']; // Nombres para generar IDs de celda

// Horarios exactos de los módulos UDP (basado en tu imagen)
const udpModules = [
    "08:30", "09:40", "10:50", "12:00", "13:10", "14:20", "15:30",
    "16:40", "17:50", "19:00", "20:10", "21:20"
];

// Mapeo de la hora de inicio del módulo a su índice (0 a N-1) para facilitar cálculos
const moduleTimeToIndex = {};
udpModules.forEach((time, index) => {
    moduleTimeToIndex[time] = index;
});

const moduleDurationMinutes = 70; // Duración estándar de un módulo en minutos (09:40 - 08:30 = 70)
const rowHeightPx = 50; // Altura en píxeles de cada fila de módulo en el CSS (.horario-cell)

// --- FUNCIONES DE PERSISTENCIA ---

/**
 * Guarda los cursos seleccionados en localStorage.
 */
function saveSelectedCourses() {
    localStorage.setItem('selectedCourses', JSON.stringify(selectedCourses));
}

/**
 * Carga los cursos seleccionados desde localStorage al inicio.
 */
function loadSelectedCourses() {
    const savedCourses = localStorage.getItem('selectedCourses');
    if (savedCourses) {
        selectedCourses = JSON.parse(savedCourses);
    }
}

// --- FUNCIONES PRINCIPALES ---

/**
 * Carga y procesa todos los archivos CSV de cursos.
 */
async function loadAllCourses() {
    cursosContainer.innerHTML = '<p>Cargando cursos...</p>';

    const categories = new Set(); // Para el filtro de categorías

    for (const file of csvFiles) {
        try {
            const response = await fetch(file);
            const csvText = await response.text();
            const coursesFromFile = parseCSV(csvText);

            // Asigna una categoría basada en el nombre del archivo
            const categoryName = file.replace('_Procesado.csv', '').replace(/_/g, ' ');
            coursesFromFile.forEach(course => {
                course.Categoria = categoryName;
                categories.add(categoryName);
            });
            allCourses = allCourses.concat(coursesFromFile);
        } catch (error) {
            console.error(`Error al cargar el archivo ${file}:`, error);
            cursosContainer.innerHTML = `<p style="color: red;">Error al cargar el archivo ${file}. Asegúrate de que está en la misma carpeta y su nombre es correcto.</p>`;
        }
    }

    // Filtramos cursos duplicados (si un mismo bloque de clase está en varios CSVs)
    const uniqueCourses = [];
    const seenCourseIds = new Set();

    allCourses.forEach(course => {
        const id = generateCourseId(course);
        if (!seenCourseIds.has(id)) {
            uniqueCourses.push(course);
            seenCourseIds.add(id);
        }
    });
    allCourses = uniqueCourses;

    populateCategoryFilter(Array.from(categories)); // Rellenar filtro de categorías
    displayCourses(allCourses);
    drawHorarioGrid(); // Dibuja la estructura base del horario UNA SOLA VEZ
    updateHorario(); // Actualiza el horario con los cursos seleccionados (incluyendo los de persistencia)
}

/**
 * Rellena el select de filtro de categorías.
 * @param {Array<string>} categories Array de nombres de categorías.
 */
function populateCategoryFilter(categories) {
    filtroCategoriaSelect.innerHTML = '<option value="todos">Todas las Categorías</option>';
    categories.sort().forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        filtroCategoriaSelect.appendChild(option);
    });
}

/**
 * Parsea el texto de un CSV a un arreglo de objetos JavaScript.
 * @param {string} csvText El contenido del archivo CSV como texto.
 * @returns {Array<Object>} Un arreglo de objetos, donde cada objeto es un curso.
 */
function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return [];

    // Regex para dividir por comas, pero ignorando comas dentro de comillas dobles.
    // También maneja casos donde el último campo está vacío después de una coma.
    // Fuente: Adaptado de ejemplos comunes de parsing CSV en JS para manejar comillas
    const csvRowRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)|(?<=^[^"]*),/g;


    const headers = lines[0].split(',').map(header => header.trim());

    const courses = [];
    for (let i = 1; i < lines.length; i++) {
        // Usa la regex para dividir la línea, y luego trim() cada valor
        const values = lines[i].split(csvRowRegex).map(value => value.trim());

        // Manejo de comillas en los valores (eliminar las comillas extra)
        for (let k = 0; k < values.length; k++) {
            if (values[k].startsWith('"') && values[k].endsWith('"')) {
                values[k] = values[k].substring(1, values[k].length - 1);
            }
        }

        // Asegura que la fila tenga el número correcto de columnas y no esté vacía
        if (values.length === headers.length && values.some(val => val !== '')) {
            const course = {};
            for (let j = 0; j < headers.length; j++) {
                // Si el valor está vacío o es 'nan' (case-insensitive), lo convierte a null
                course[headers[j]] = (values[j] === '' || values[j].toLowerCase() === 'nan') ? null : values[j];
            }

            // Agrega el curso si tiene los datos necesarios para posicionarlo en el horario
            if (course.Codigo && course.Nombre && course.Dia && course.HoraInicio && course.HoraFin) {
                // Rellena campos opcionales con valores por defecto si están vacíos
                course.Seccion = course.Seccion || "NA";
                course.Profesor = course.Profesor || "Desconocido";
                course.Créditos = parseFloat(course.Créditos) || 0;

                courses.push(course);
            }
        } else {
            // Opcional: Para depuración, puedes loggear las líneas problemáticas
            console.warn(`Saltando línea CSV mal formada (no coincide con el número de encabezados): "${lines[i]}"`);
            console.warn(`Valores parseados:`, values);
            console.warn(`Encabezados:`, headers);
        }
    }
    return courses;
}

/**
 * Muestra la lista de cursos en el contenedor de la oferta académica.
 * @param {Array<Object>} coursesToDisplay Los cursos a mostrar.
 */
function displayCourses(coursesToDisplay) {
    cursosContainer.innerHTML = '';

    if (coursesToDisplay.length === 0) {
        cursosContainer.innerHTML = '<p>No se encontraron cursos que coincidan con la búsqueda.</p>';
        return;
    }

    coursesToDisplay.forEach(course => {
        const courseDiv = document.createElement('div');
        courseDiv.className = 'curso-item';
        courseDiv.innerHTML = `
            <div>
                <strong>${course.Codigo || 'N/A'} - ${course.Nombre || 'N/A'}</strong><br>
                Sección: ${course.Seccion || 'N/A'} | Profesor: ${course.Profesor || 'N/A'}<br>
                Horario: ${course.Dia || 'N/A'} ${course.HoraInicio || 'N/A'} - ${course.HoraFin || 'N/A'} | Créditos: ${course.Créditos || 'N/A'}
            </div>
            <button data-course-id="${generateCourseId(course)}">Agregar</button>
        `;
        cursosContainer.appendChild(courseDiv);
    });

    addCourseEventListeners();
}

/**
 * Genera un ID único para un bloque de curso.
 * @param {Object} course El objeto curso.
 * @returns {string} El ID único.
 */
function generateCourseId(course) {
    return `${course.Codigo || ''}-${course.Seccion || 'NA'}-${course.Dia || ''}-${course.HoraInicio || ''}-${course.HoraFin || ''}`;
}

/**
 * Agrega los event listeners a los botones "Agregar" de los cursos.
 */
function addCourseEventListeners() {
    document.querySelectorAll('.curso-item button').forEach(button => {
        button.onclick = (event) => {
            const courseId = event.target.dataset.courseId;
            const courseToAdd = allCourses.find(c => generateCourseId(c) === courseId);

            if (courseToAdd && !selectedCourses.some(c => generateCourseId(c) === courseId)) {
                selectedCourses.push(courseToAdd);
                saveSelectedCourses(); // Guarda después de añadir un curso
                updateHorario();
            }
        };
    });
}

/**
 * Elimina un curso del horario seleccionado.
 * @param {string} courseIdToRemove El ID del curso a eliminar.
 */
function removeCourse(courseIdToRemove) {
    selectedCourses = selectedCourses.filter(c => generateCourseId(c) !== courseIdToRemove);
    saveSelectedCourses(); // Guarda después de eliminar un curso
    updateHorario();
}

/**
 * Actualiza la visualización del horario y detecta/muestra topes.
 */
function updateHorario() {
    // 1. Limpiar todos los cursos existentes en el horario
    horarioGrid.querySelectorAll('.curso-horario').forEach(courseDiv => courseDiv.remove());

    let totalCredits = 0; // Reiniciamos el contador de créditos
    topesAlert.innerHTML = ''; // Limpiamos el mensaje de topes

    // Mapa para agrupar cursos que se superponen en el mismo día/franja horaria
    const conflictingGroupsByTimeSlot = new Map();

    selectedCourses.forEach(course => {
        const dayColIndex = daysMap[course.Dia];
        const startHour = parseTime(course.HoraInicio);
        const endHour = parseTime(course.HoraFin);

        totalCredits += course.Créditos; // Sumar créditos

        if (dayColIndex !== undefined && startHour !== null && endHour !== null) {
            let startModuleIndex = -1;

            // Encuentra el módulo donde el curso comienza para posicionamiento vertical
            for (let i = 0; i < udpModules.length; i++) {
                const moduleStartTime = parseTime(udpModules[i]);
                const nextModuleTime = (i + 1 < udpModules.length) ? parseTime(udpModules[i+1]) : new Date(moduleStartTime.getTime() + moduleDurationMinutes * 60 * 1000);

                if (startHour >= moduleStartTime && startHour < nextModuleTime) {
                    startModuleIndex = i;
                    break;
                } else if (startHour < moduleStartTime && i === 0) { // Si el curso empieza antes del primer módulo
                    startModuleIndex = 0;
                    break;
                }
            }

            if (startModuleIndex === -1) {
                console.warn(`No se pudo posicionar el curso ${course.Codigo} (${course.HoraInicio}-${course.HoraFin}). Hora de inicio fuera de los módulos definidos.`);
                return;
            }

            const courseDiv = document.createElement('div');
            courseDiv.className = 'curso-horario';
            courseDiv.innerHTML = `<div class="codigo-simple">${course.Codigo || ''}<br>${course.Seccion || ''}</div>`;

            courseDiv.dataset.courseId = generateCourseId(course);
            courseDiv.dataset.day = course.Dia;
            courseDiv.dataset.startTime = course.HoraInicio;
            courseDiv.dataset.endTime = course.HoraFin;

            // --- CÁLCULO DE POSICIÓN Y TAMAÑO EN EL GRID ---
            // Columna: Día + 1 (la primera columna es para las horas)
            courseDiv.style.gridColumn = `${dayColIndex + 1} / span 1`;

            // Fila de inicio: Índice del módulo de inicio + 2 (la primera fila es para los días, la segunda para las horas del módulo 0)
            const gridRowStart = startModuleIndex + 2;

            // Número de módulos que abarca el curso
            const durationMinutes = (endHour.getTime() - startHour.getTime()) / (1000 * 60);
            const numberOfModules = Math.ceil(durationMinutes / moduleDurationMinutes);

// CALCULA el desplazamiento vertical (en px)
// CALCULA el desplazamiento vertical (en px)
// ✅ Añadimos "+1" para que no tape los encabezados de días
const offsetY = (startModuleIndex + 1) * rowHeightPx;
courseDiv.style.setProperty('--offset', `${offsetY}px`);

// CALCULA la altura del curso en píxeles
const heightPx = numberOfModules * rowHeightPx;
courseDiv.style.height = `${heightPx}px`;

            // Añade el curso directamente al grid principal
            courseDiv.style.width = '100%';  // ancho completo por defecto
            courseDiv.style.left = '0%';     // sin desplazamiento horizontal
            horarioGrid.appendChild(courseDiv);

            courseDiv.onclick = (event) => {
                event.stopPropagation(); // Evita que el clic en el curso también active el clic en la celda
                const confirmRemove = confirm(`¿Estás seguro de que quieres eliminar "${course.Nombre}" de tu horario?`);
                if (confirmRemove) {
                    removeCourse(courseDiv.dataset.courseId);
                }
            };
        }
    });
// Mostrar lista debajo del horario
const resumenContainer = document.getElementById('resumenCursos');
resumenContainer.innerHTML = ''; // Limpia antes de repintar

selectedCourses.forEach(course => {
    const div = document.createElement('div');
    div.className = 'resumen-item';
    div.innerHTML = `
        <span><strong>[${course.Codigo} - ${course.Seccion}]</strong> ${course.Nombre}</span>
        <button class="btn-quitar" data-course-id="${generateCourseId(course)}">✖</button>
    `;
    resumenContainer.appendChild(div);
});

document.querySelectorAll('.btn-quitar').forEach(btn => {
    btn.onclick = () => {
        const id = btn.dataset.courseId;
        removeCourse(id);
    };
});
    // Actualizar el total de créditos
    totalCreditsDisplay.textContent = `Total Créditos: ${totalCredits}`;

    // --- MANEJO DE CONFLICTOS VISUALES (mostrar ambos cursos) ---
    // Limpiar clases de conflicto previas de todos los cursos
    document.querySelectorAll('.curso-horario').forEach(div => {
        div.classList.remove('tope'); // Quita el color rojo
        // Sus estilos de posicionamiento ya no dependen de 'left'/'width' sino de grid
        div.style.left = '';
        div.style.width = '';
        div.style.zIndex = '20'; // Asegura que los cursos siempre estén por encima
    });

    // Detectar y agrupar conflictos reales
    const detectedConflicts = []; // Almacena pares de cursos que se solapan
    for (let i = 0; i < selectedCourses.length; i++) {
        for (let j = i + 1; j < selectedCourses.length; j++) {
            if (checkConflict(selectedCourses[i], selectedCourses[j])) {
                detectedConflicts.push([selectedCourses[i], selectedCourses[j]]);
            }
        }
    }

    if (detectedConflicts.length > 0) {
        topesAlert.innerHTML = '¡Atención! Se han detectado topes en tu horario.';

        // Agrupar cursos por franjas de conflicto (un día, y un rango de tiempo solapado)
        const conflictOverlapGroups = new Map(); // Key: "Dia_startMin_endMin", Value: Set<courseId>

        detectedConflicts.forEach(([courseA, courseB]) => {
            // Calcular el rango exacto de solapamiento
            const overlapStart = Math.max(parseTime(courseA.HoraInicio).getTime(), parseTime(courseB.HoraInicio).getTime());
            const overlapEnd = Math.min(parseTime(courseA.HoraFin).getTime(), parseTime(courseB.HoraFin).getTime());

            const key = `${courseA.Dia}_${overlapStart}_${overlapEnd}`;
            if (!conflictOverlapGroups.has(key)) {
                conflictOverlapGroups.set(key, new Set());
            }
            conflictOverlapGroups.get(key).add(generateCourseId(courseA));
            conflictOverlapGroups.get(key).add(generateCourseId(courseB));
        });

        // Aplicar estilos de conflicto visualmente
        conflictOverlapGroups.forEach(courseIdSet => {
            const coursesInThisOverlap = [];
            courseIdSet.forEach(id => {
                const courseDiv = document.querySelector(`.curso-horario[data-course-id="${id}"]`);
                if (courseDiv) {
                    coursesInThisOverlap.push(courseDiv);
                }
            });

            if (coursesInThisOverlap.length > 1) {
                const numConflicting = coursesInThisOverlap.length;
                const widthPerCourse = 100 / numConflicting; // Ej: 50% para 2, 33.3% para 3

                coursesInThisOverlap.forEach((div, index) => {
                    // Estos estilos de 'left' y 'width' ahora son relativos al curso-horario mismo, no a la celda.
                    // Los aplicamos para dividir el espacio HORIZONTALMENTE dentro del SLOT DE TIEMPO que el curso ocupa.
                    // La posición vertical ya está manejada por grid-row.
                    div.style.width = `${widthPerCourse - 0.5}%`; // Ancho con un pequeño espacio
                    div.style.left = `${index * widthPerCourse}%`; // Posición horizontal
                    div.classList.add('tope'); // Poner en rojo
                    div.style.zIndex = 100 + index; // Asegurar que estén por encima de todo
                });
            }
        });
    }
}


/**
 * Dibuja la cuadrícula básica del horario (días, horas de módulos y celdas vacías).
 * Esta función se llama solo una vez al inicio.
 */
function drawHorarioGrid() {
    // Limpiar completamente el grid antes de redibujar la estructura base
    horarioGrid.innerHTML = '';

    // Configura las filas del grid según la cantidad de módulos UDP y su altura
    horarioGrid.style.gridTemplateRows = `repeat(${udpModules.length + 1}, ${rowHeightPx}px)`; // +1 para la fila de los días

    // ¡CAMBIO CLAVE AQUÍ! Se establece un ancho fijo para la primera columna (horas)
    horarioGrid.style.gridTemplateColumns = `90px repeat(${dayNames.length}, 1fr)`;

    // Celda vacía en la esquina superior izquierda (¡CORREGIDO: Creación del elemento!)
    const emptyCell = document.createElement('div');
    emptyCell.className = 'horario-header';
    horarioGrid.appendChild(emptyCell); // Añadirla al grid

    // Encabezados de días (Lunes a Viernes)
    dayNames.forEach((day, index) => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'horario-header';
        dayHeader.textContent = day;
        horarioGrid.appendChild(dayHeader);
    });

    // Filas de horas y celdas individuales del horario
    udpModules.forEach((moduleTime, moduleIndex) => {
        // Div para la etiqueta de la hora del módulo
        const hourDiv = document.createElement('div');
        hourDiv.className = 'horario-time';
        hourDiv.textContent = moduleTime;
        horarioGrid.appendChild(hourDiv);

        // Celdas para cada día en esa franja horaria del módulo (estos son solo los "fondos" de la cuadrícula)
        dayNames.forEach((dayName, dayIndex) => {
            const cell = document.createElement('div');
            cell.className = 'horario-cell';
            // Asignar un ID único a cada celda para poder identificarla si fuera necesario
            cell.id = `cell-${dayName}-${moduleIndex}`;
            horarioGrid.appendChild(cell);
        });
    });
}

/**
 * Convierte una cadena de hora ("HH:MM") a un objeto Date para facilitar comparaciones.
 * @param {string} timeStr La cadena de hora (ej. "08:30").
 * @returns {Date | null} Objeto Date con la hora o null si hay error.
 */
function parseTime(timeStr) {
    if (!timeStr) return null;
    try {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        return date;
    } catch (e) {
        console.error("Error al parsear la hora:", timeStr, e);
        return null;
    }
}

/**
 * Comprueba si hay un conflicto de horario entre dos cursos.
 * @param {Object} courseA Primer objeto curso.
 * @param {Object} courseB Segundo objeto curso.
 * @returns {boolean} True si hay conflicto, false si no.
 */
function checkConflict(courseA, courseB) {
    // Si son el mismo bloque de clase, no hay tope consigo mismo
    if (generateCourseId(courseA) === generateCourseId(courseB)) {
        return false;
    }

    // Si los días son diferentes, no hay tope
    if (courseA.Dia !== courseB.Dia) {
        return false;
    }

    // Parsear las horas a objetos Date para facilitar la comparación
    const startA = parseTime(courseA.HoraInicio);
    const endA = parseTime(courseA.HoraFin);
    const startB = parseTime(courseB.HoraInicio);
    const endB = parseTime(courseB.HoraFin);

    // Si alguna hora no se pudo parsear, no hay conflicto (para evitar errores)
    if (!startA || !endA || !startB || !endB) {
        return false;
    }

    // Condición de tope: [startA, endA) y [startB, endB) se solapan si:
    // startA < endB Y endA > startB
    return (startA < endB && endA > startB);
}

/**
 * Función de filtrado principal que combina búsqueda de texto y filtro de categoría.
 */
function applyFilters() {
    const searchText = filtroCursoInput.value.toLowerCase();
    const selectedCategory = filtroCategoriaSelect.value;

    const filteredCourses = allCourses.filter(course => {
        const matchesSearch = (course.Codigo && course.Codigo.toLowerCase().includes(searchText)) ||
                              (course.Nombre && course.Nombre.toLowerCase().includes(searchText)) ||
                              (course.Profesor && course.Profesor.toLowerCase().includes(searchText));

        const matchesCategory = (selectedCategory === 'todos' || (course.Categoria && course.Categoria.toLowerCase() === selectedCategory.toLowerCase()));

        return matchesSearch && matchesCategory;
    });

    displayCourses(filteredCourses);
}

// Event Listeners para los filtros
filtroCursoInput.addEventListener('keyup', applyFilters);
filtroCategoriaSelect.addEventListener('change', applyFilters);


// Event Listener para el botón "Limpiar Horario"
clearScheduleBtn.addEventListener('click', () => {
    selectedCourses = []; // Vacía el array de cursos seleccionados
    saveSelectedCourses(); // Guarda el estado vacío en localStorage
    updateHorario();      // Actualiza la visualización del horario
    topesAlert.innerHTML = ''; // Limpia también el mensaje de topes
});

// Event Listener para el botón "Exportar Horario como Imagen" (Lógica por implementar)
exportImageBtn.addEventListener('click', () => {
    // Lógica para exportar como imagen
    const element = document.getElementById('horarioGrid');
    // html2canvas necesita el elemento completo para capturarlo bien
    html2canvas(element, { scale: 2 }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = imgData;
        link.download = 'mi_horario_udp.png';
        link.click();
    });
});


// --- INICIAR LA APLICACIÓN ---
loadSelectedCourses(); // Carga los cursos guardados al inicio
loadAllCourses();      // Carga la oferta académica y dibuja el horario
applyFilters(); // Aplica los filtros iniciales al cargar (vacíos al principio)

})(); // Fin de la IIFE