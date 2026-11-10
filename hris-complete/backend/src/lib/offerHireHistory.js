// Preserve the first recorded hire date when an accepted offer is saved again.
export function offerHireHistory(application, movedAt, movedById) {
  if ((application.stageHistory || []).some(event => event.toStage === 'hired')) return {};
  return { stageHistory: { create: {
    fromStage: application.stage, fromDisplayStage: application.displayStage,
    toStage: 'hired', toDisplayStage: 'Hired', movedAt, movedById,
    reason: 'Offer accepted by candidate',
  } } };
}
