import { Router } from "express";
import pg from "../../config/db.config";
import { Room } from "../../config/entities";

const router = Router();

// Obtenir toutes les salles actives
router.get("/", async (_, res) => {
  try {
    const roomRepository = pg.getRepository(Room);
    const rooms = await roomRepository.find({
      where: { isActive: true },
      order: { id: "ASC" },
    });
    res.json(rooms);
  } catch (error) {
    console.error("Erreur lors de la récupération des salles:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Obtenir une salle par ID
router.get("/:id", async (req, res) => {
  try {
    const roomRepository = pg.getRepository(Room);
    const room = await roomRepository.findOne({
      where: { id: parseInt(req.params.id) },
    });

    if (!room) {
      res.status(404).json({ error: "Salle non trouvée" });
      return;
    }

    res.json(room);
  } catch (error) {
    console.error("Erreur lors de la récupération de la salle:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Créer une nouvelle salle
router.post("/", async (req, res) => {
  try {
    const { name, description, maxParticipants } = req.body;

    if (!name) {
      res.status(400).json({ error: "Le nom de la salle est requis" });
      return;
    }

    const roomRepository = pg.getRepository(Room);
    const room = roomRepository.create({
      name,
      description,
      maxParticipants: maxParticipants || 10,
    });

    const savedRoom = await roomRepository.save(room);
    res.status(201).json(savedRoom);
  } catch (error) {
    console.error("Erreur lors de la création de la salle:", error);
    if ((error as any).code === "23505") {
      // Contrainte d'unicité
      res.status(409).json({ error: "Une salle avec ce nom existe déjà" });
    } else {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
});

// Mettre à jour une salle
router.put("/:id", async (req, res) => {
  try {
    const { name, description, maxParticipants, isActive } = req.body;
    const roomRepository = pg.getRepository(Room);

    const room = await roomRepository.findOne({
      where: { id: parseInt(req.params.id) },
    });

    if (!room) {
      res.status(404).json({ error: "Salle non trouvée" });
      return;
    }

    if (name !== undefined) room.name = name;
    if (description !== undefined) room.description = description;
    if (maxParticipants !== undefined) room.maxParticipants = maxParticipants;
    if (isActive !== undefined) room.isActive = isActive;

    const updatedRoom = await roomRepository.save(room);
    res.json(updatedRoom);
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la salle:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Supprimer une salle (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const roomRepository = pg.getRepository(Room);
    const room = await roomRepository.findOne({
      where: { id: parseInt(req.params.id) },
    });

    if (!room) {
      res.status(404).json({ error: "Salle non trouvée" });
      return;
    }

    room.isActive = false;
    await roomRepository.save(room);

    res.json({ message: "Salle désactivée avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression de la salle:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
