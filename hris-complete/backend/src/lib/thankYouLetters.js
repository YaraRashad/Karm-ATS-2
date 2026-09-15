import { createHash } from 'node:crypto';

export function letterPreview(application) {
  const name = [application.candidate.firstName, application.candidate.lastName].filter(Boolean).join(' ');
  const to = application.candidate.email || '';
  const subject = `Thank you for your interest in ${application.position.title} at Karm`;
  const text = `Dear ${name || 'Candidate'},\n\nThank you for your interest in the ${application.position.title} position at Karm and for the time you have invested in our recruitment process.\n\nAfter careful consideration, we will not be moving forward with your application for this position.\n\nWe appreciate the opportunity to learn about your experience and wish you every success in your career.\n\nKind regards,\nKarm Recruitment Team`;
  const validEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to) && !/@(no-email|unknown)\.local$/i.test(to);
  const token = createHash('sha256').update(JSON.stringify([application.id, to, subject, text])).digest('hex');
  return { to, subject, text, token, validEmail };
}

// A conditional database update claims each letter once, even with simultaneous approvals.
export async function confirmLetter({ prisma, sendEmail, application, token, adminId }) {
  const preview = letterPreview(application);
  if (application.stage !== 'rejected' || application.thankYouStatus !== 'pending') throw new Error('This application is no longer awaiting a thank you letter.');
  if (token !== preview.token) throw new Error('Candidate or role details changed. Refresh and review the letter again.');
  if (!preview.validEmail) throw new Error('Add a valid candidate email address before sending.');
  const claim = await prisma.application.updateMany({
    where: { id: application.id, stage: 'rejected', thankYouStatus: 'pending', updatedAt: application.updatedAt },
    data: { thankYouStatus: 'sending', thankYouApprovedBy: adminId, thankYouRecipient: preview.to, thankYouSubject: preview.subject, thankYouBody: preview.text },
  });
  if (claim.count !== 1) throw new Error('This letter changed or has already been confirmed. Refresh the queue.');
  try {
    const result = await sendEmail(preview);
    if (result.skipped) {
      await prisma.application.update({ where: { id: application.id }, data: { thankYouStatus: 'pending' } });
      return { status: 'pending', message: 'Email service is not configured. No email was sent.' };
    }
    if (!result.sent) throw new Error('Email delivery was not confirmed.');
    await prisma.application.update({ where: { id: application.id }, data: { thankYouStatus: 'sent', thankYouSentAt: new Date() } });
    return { status: 'sent' };
  } catch (error) {
    // SMTP timeouts can happen after acceptance: never retry automatically.
    await prisma.application.update({ where: { id: application.id }, data: { thankYouStatus: 'needs_review' } });
    return { status: 'needs_review', message: 'Delivery could not be confirmed. Check mail delivery records before sending again.' };
  }
}
