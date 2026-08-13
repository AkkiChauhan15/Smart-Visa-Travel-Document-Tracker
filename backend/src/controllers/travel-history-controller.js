import {
  createOwnedTrip,
  deleteOwnedTrip,
  findOwnedTrip,
  listOwnedTrips,
  pickTripFields,
  serializeTrip,
  updateOwnedTrip,
} from '../services/travel-history-service.js';

export async function listTravelHistory(req, res, next) {
  try {
    const trips = await listOwnedTrips(req.user.id);
    res.json({ trips: trips.map(serializeTrip) });
  } catch (error) {
    next(error);
  }
}

export async function getTravelHistory(req, res, next) {
  try {
    const trip = await findOwnedTrip(req.user.id, req.params.id);
    res.json({ trip: serializeTrip(trip) });
  } catch (error) {
    next(error);
  }
}

export async function createTravelHistory(req, res, next) {
  try {
    const trip = await createOwnedTrip(req.user.id, pickTripFields(req.body));
    res.status(201).json({ trip: serializeTrip(trip) });
  } catch (error) {
    next(error);
  }
}

export async function updateTravelHistory(req, res, next) {
  try {
    const trip = await updateOwnedTrip(req.user.id, req.params.id, pickTripFields(req.body));
    res.json({ trip: serializeTrip(trip) });
  } catch (error) {
    next(error);
  }
}

export async function deleteTravelHistory(req, res, next) {
  try {
    await deleteOwnedTrip(req.user.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

