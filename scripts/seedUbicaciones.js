const mongoose = require("mongoose");
const Ubicacion = require("../models/Ubicacion");

const MONGO_URI = "mongodb://localhost:27017/entregas_turnos";

async function crearUbicacion(nombre, tipo, padre = null) {
  return Ubicacion.create({ nombre, tipo, padre });
}

const DATA = [
  {
    nombre: "PISO 1",
    areas: [
      { nombre: "ARCHIVO" },
      {
        nombre: "EMERGENCIA Y TRAUMA",
        subareas: [
          "CONSULTORIO",
          "FACTURACION URGENCIAS",
          "REANIMACION",
          "EMERGENCIAS VIP",
          "SALA 1",
          "SALA 2",
          "SALA 3",
          "SALA 4",
          "UCI ADULTOS 1",
          "UCI INTERMEDIA",
        ],
      },
      { nombre: "FARMA AZUL" },
      { nombre: "LOBBY" },
      { nombre: "BOUTIQUE" },
      { nombre: "DIRECCION GESTION CLINICA" },
      { nombre: "EXPERIENCIA DEL PACIENTE" },
      { nombre: "FLORISTERIA" },
      { nombre: "OFICINA SALUD MIA" },
      { nombre: "OFICINA SERVICIOS INTERNACIONALES" },
      { nombre: "PRE-ADMISIONES" },
      {
        nombre: "SALA ZAPATOCA VIP",
        subareas: ["EXPERIENCIA AL PACIENTE"],
      },
      { nombre: "VIDEOWALL" },
      { nombre: "MONTAÑAS AZULES - ADMINISTRATIVO" },
      { nombre: "SALA DE BIENESTAR" },
    ],
  },

  {
    nombre: "PISO 2",
    areas: [
      { nombre: "CARPINTERIA" },
      {
        nombre: "ADMINISTRATIVO",
        subareas: [
          "ADMISIONES",
          "ASEGURAMIENTO AL INGRESO",
          "AUDITORIA",
          "AUDITORIA INTEGRAL",
          "AUTORIZACIONES",
          "COH",
          "CONTROL Y PRESUPUESTO",
          "CONVENIOS",
          "COSTOS",
          "COTIZACIONES",
          "CUENTAS MEDICAS",
          "DGEAS",
          "DIRECCION COMERCIAL",
          "DIRECCION MEDICA",
          "DIRECCIONES OPERACIONES ADMINISTRATIVAS",
          "DOA",
          "FACTURACION",
          "GERENCIA",
          "GERENCIA DE OPERACIONES HOSPITALARIAS",
          "RADICACION",
          "SEGURIDAD AL PACIENTE",
          "SISTEMAS DE INGRESO",
        ],
      },
      {
        nombre: "AREA ASISTENCIAL",
        subareas: [
          "CLINICA DEL DOLOR",
          "NEUMOLOGIA",
          "NEUROCIENCIAS",
          "NEUROLOGIA",
          "UNIDAD DE QUEMADOS",
          "UROLOGIA",
        ],
      },
      { nombre: "NEUROLOGIA" },
      { nombre: "PELUQUERIA" },
    ],
  },

  {
    nombre: "PISO 3",
    areas: [
      { nombre: "CENTRAL MONITOREO CIRUGIA" },
      {
        nombre: "CIRUGIA",
        subareas: [
          "PREANESTESIA",
        ],
      },
      { nombre: "FACTURACION" },
      {
        nombre: "HEMODINAMIA",
        subareas: [
          "RECUPERACION HEMODINAMIA",
        ],
      },
      { nombre: "SALA VELEZ" },
      { nombre: "UCI 1" },
      { nombre: "UCI 2" },
      { nombre: "UCI 3" },
      { nombre: "UCI PEDIATRICA" },
    ],
  },

  {
    nombre: "PISO 4",
    areas: [
      { nombre: "HOSPI PISO 4 ALA ORIENTAL" },
      {
        nombre: "HOSPITALIZACION GENERAL P4",
        subareas: [
          "ADMINISTRATIVO",
        ],
      },
      { nombre: "HOSPITALIZACION" },
      { nombre: "PISO 4-VIP" },
    ],
  },

  {
    nombre: "PISO 5",
    areas: [
      {
        nombre: "HOSPITALIZACION GENERAL P5",
        subareas: [
          "ADMINISTRATIVO",
          "FACTURACION",
          "PREHOSPITALIZACION ADULTOSANESTESIA",
          "LACTARIO",
          "PEDIATRIA",
          "UNIDAD RENAL",
        ],
      },
    ],
  },

  {
    nombre: "PISO 6",
    areas: [
      {
        nombre: "HOSPITALIZACION GENERAL P6",
        subareas: [
          "ADMINISTRATIVO",
          "HOSPITALIZACION",
        ],
      },
    ],
  },

  {
    nombre: "PISO 7",
    areas: [
      {
        nombre: "HOSPITALIZACION GENERAL",
        subareas: [
          "ADMINISTRATIVO",
          "NEUROLOGIA",
          "ORTOPEDIA",
        ],
      },
    ],
  },

  {
    nombre: "PISO 8",
    areas: [
      { nombre: "ADMINISTRATIVO" },
      {
        nombre: "HOSPITALIZACION GENERAL P8",
        subareas: [
          "FACTURACION",
          "HEMATOLOGIA",
          "ONCOLOGIA",
        ],
      },
    ],
  },

  {
    nombre: "PISO 9",
    areas: [
      { nombre: "CENTRO DE CABLEADO" },
      {
        nombre: "HOSPITALIZACION GENERAL P9",
        subareas: [
          "FACTURACION",
          "ONCOLOGIA ADULTO",
          "ONCOLOGIA PEDIATRICO",
          "TRANSPLANTE",
          "TRANSPLANTE CAMARAS"
        ],
      },
    ],
  },

  {
    nombre: "SOTANO 1",
    areas: [
      { nombre: "ADMISIONES CONSULTA EXTERNA" },
      { nombre: "ADMISIONES IMAGENES DIAGNOSTICAS" },
      { nombre: "BANCO DE SANGRE" },
      { nombre: "CHEQUEOS EJECUTIVOS" },
      { nombre: "GASTROENTEROLOGIA CONSULTA EXTERNA" },
      { nombre: "IMAGENES DIAGNOSTICAS" },
      { nombre: "LABORATORIO CLINICO" },
      { nombre: "MEDICINA NUCLEAR" },
      { nombre: "ONCOLOGIA ADMISIONES" },
      { nombre: "ONCOLOGIA CONSULTA EXTERNA" },
      { nombre: "QUIMIOTERAPIA AMBULATORIA ADULTO" },
      { nombre: "QUIMIOTERAPIA AMBULATORIA PEDIATRICA" },
      { nombre: "RADIOLOGIA" },
      { nombre: "RADIOTERAPIA" },
    ],
  },

  {
    nombre: "SOTANO 2",
    areas: [
      { nombre: "AUDITORIA INTEGRAL" },
      { nombre: "CENTRAL DE ESTERILIZACIONES" },
      { nombre: "CENTRAL DE MEZCLAS" },
      { nombre: "CENTRAL DE MONITOREO" },
      { nombre: "DEPARTAMENTO DE TECNOLOGIA INFORMATICA" },
      { nombre: "INGENIERIA CLINICA" },
      { nombre: "INGENIERIA HOSPITALARIA" },
      { nombre: "INGENIERIA SISTEMAS" },
      { nombre: "SERVICIO FARMACEUTICO" },
    ],
  },

  {
    nombre: "SOTANO 3",
    areas: [
      { nombre: "ACTIVOS FIJOS" },
      { nombre: "CENTRAL DE RESIDUOS" },
      { nombre: "COMPRAS" },
      { nombre: "ETIQUETADO" },
      { nombre: "LOGISTICA" },
      { nombre: "OFICINA REGISTRO Y CONTROL" },
      { nombre: "PATOLOGIA Y MORGUE" },
    ],
  },

];

async function run() {
  await mongoose.connect(MONGO_URI);

  console.log("🧹 Limpiando ubicaciones...");
  await Ubicacion.deleteMany({});

  for (const pisoData of DATA) {
    const piso = await crearUbicacion(pisoData.nombre, "piso");

    for (const areaData of pisoData.areas) {
      const area = await crearUbicacion(areaData.nombre, "area", piso._id);

      if (areaData.subareas) {
        for (const sub of areaData.subareas) {
          await crearUbicacion(sub, "subarea", area._id);
        }
      }
    }
  }

  console.log("✅ Ubicaciones creadas correctamente");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
