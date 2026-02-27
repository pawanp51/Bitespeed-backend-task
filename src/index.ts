import express from "express";
import { PrismaClient, Contact } from "@prisma/client";

const app = express();
app.use(express.json());
const prisma = new PrismaClient();

function normalizePhone(p?: string | number | null) {
  if (!p) return null;
  return String(p).replace(/\D/g, "");
}

app.post("/identify", async (req, res) => {
  const { email: rawEmail, phoneNumber: rawPhone } = req.body as {
    email?: string | null;
    phoneNumber?: string | number | null;
  };

  const email = rawEmail?.toLowerCase?.() ?? null;
  const phone = normalizePhone(rawPhone);

  if (!email && !phone) {
    return res.status(400).json({ error: "Provide email or phoneNumber" });
  }

  // 1) find all contacts that match by email OR phone
  const matching = await prisma.contact.findMany({
    where: {
      OR: [
        email ? { email } : undefined,
        phone ? { phoneNumber: phone } : undefined
      ].filter(Boolean) as any
    },
    orderBy: { createdAt: "asc" }
  });

  // 2) If no matches: create new primary and return
  if (matching.length === 0) {
    const created = await prisma.contact.create({
      data: { email, phoneNumber: phone, linkPrecedence: "primary" }
    });

    return res.json({
      contact: {
        primaryContatctId: created.id,
        emails: email ? [email] : [],
        phoneNumbers: phone ? [phone] : [],
        secondaryContactIds: []
      }
    });
  }

  // === We have at least one matching contact ===
  // Gather all contacts that belong to the same "group".
  // A contact group shares primary and its secondaries. But users may have multiple primaries,
  // so we need to:
  //  - find all primary contacts among matching results OR follow linkedId chains to find real primaries
  const allRelated: Contact[] = [];

  // collect initial ids to expand
  const queueIds = new Set<number>();
  matching.forEach(m => queueIds.add(m.id));

  // BFS-like expansion: find any contacts that share email/phone with those found (recursively)
  // To be safe, we will fetch all contacts where email or phone matches any email/phone in current set,
  // iterating until stable.
  let emails = new Set<string>();
  let phones = new Set<string>();
  matching.forEach(m => { if (m.email) emails.add(m.email); if (m.phoneNumber) phones.add(m.phoneNumber); });

  while (true) {
    const found = await prisma.contact.findMany({
      where: {
        OR: [
          ...Array.from(emails).map(e => ({ email: e })),
          ...Array.from(phones).map(p => ({ phoneNumber: p }))
        ]
      }
    });

    const newEmails = new Set(emails);
    const newPhones = new Set(phones);
    let changed = false;

    for (const f of found) {
      if (!queueIds.has(f.id)) {
        queueIds.add(f.id);
        changed = true;
        if (f.email) newEmails.add(f.email);
        if (f.phoneNumber) newPhones.add(f.phoneNumber);
      }
    }

    emails = newEmails;
    phones = newPhones;

    if (!changed) break;
  }

  // now fetch all contacts by collected emails or phones
  const related = await prisma.contact.findMany({
    where: {
      OR: [
        ...Array.from(emails).map(e => ({ email: e })),
        ...Array.from(phones).map(p => ({ phoneNumber: p }))
      ]
    },
    orderBy: { createdAt: "asc" }
  });

  // Determine the primary contact: the earliest createdAt among all related primaries/records
  // If some records are already secondary, their linkedId points to their primary; resolve to real primary id.
  // Create map of id->contact for convenience
  const byId = new Map<number, Contact>();
  related.forEach(r => byId.set(r.id, r));

  // Find candidate primary ids: for each contact, if linkPrecedence === "primary" and deletedAt is null
  const primaryCandidates = related.filter(r => r.linkPrecedence === "primary");
  let primaryContact: Contact;
  if (primaryCandidates.length > 0) {
    // choose earliest createdAt primary
    primaryContact = primaryCandidates.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
  } else {
    // No explicit primary found (edge case) -> choose earliest record overall
    primaryContact = related.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
  }

  // If there exist other primaries created after primaryContact, they must become secondaries (merge)
  const otherPrimaries = related.filter(r => r.linkPrecedence === "primary" && r.id !== primaryContact.id);

  // Run a transaction to update merges and possibly create a new secondary record if incoming has new info
  await prisma.$transaction(async (tx) => {
    // Convert other primaries to secondary linking to chosen primary
    for (const op of otherPrimaries) {
      await tx.contact.update({
        where: { id: op.id },
        data: {
          linkPrecedence: "secondary",
          linkedId: primaryContact.id,
          updatedAt: new Date()
        }
      });
      // Also update their secondaries (if any) to link to chosen primary
      await tx.contact.updateMany({
        where: { linkedId: op.id },
        data: { linkedId: primaryContact.id }
      });
    }

    // Check if incoming email/phone exists among related records
    const emailsSet = new Set(related.map(r => r.email).filter(Boolean) as string[]);
    const phonesSet = new Set(related.map(r => r.phoneNumber).filter(Boolean) as string[]);

    const missingEmail = email && !emailsSet.has(email);
    const missingPhone = phone && !phonesSet.has(phone);

    // If either incoming email or phone is new, create a secondary record linking to primary
    if (missingEmail || missingPhone) {
      await tx.contact.create({
        data: {
          email: missingEmail ? email : null,
          phoneNumber: missingPhone ? phone : null,
          linkPrecedence: "secondary",
          linkedId: primaryContact.id
        }
      });
    }
  });

  // After transaction, re-fetch all contacts linked to primaryContact.id (including primary)
  const grouped = await prisma.contact.findMany({
    where: {
      OR: [
        { id: primaryContact.id },
        { linkedId: primaryContact.id }
      ]
    },
    orderBy: { createdAt: "asc" }
  });

  const resultEmails = Array.from(new Set(grouped.map(g => g.email).filter(Boolean) as string[]));
  const resultPhones = Array.from(new Set(grouped.map(g => g.phoneNumber).filter(Boolean) as string[]));
  const secondaryIds = grouped.filter(g => g.linkPrecedence === "secondary").map(g => g.id);

  return res.json({
    contact: {
      primaryContatctId: primaryContact.id,
      emails: resultEmails,
      phoneNumbers: resultPhones,
      secondaryContactIds: secondaryIds
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));