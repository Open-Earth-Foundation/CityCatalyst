"use strict";

const IN_FLIGHT_CNB_ANNOTATION_SQL = `
UPDATE "PdfOcrJob"
SET
  annotation_mode = 'visual_context',
  status = CASE WHEN status = 'running' THEN 'queued' ELSE status END,
  lease_owner = CASE WHEN status = 'running' THEN NULL ELSE lease_owner END,
  lease_expires_at = CASE WHEN status = 'running' THEN NULL ELSE lease_expires_at END,
  heartbeat_at = CASE WHEN status = 'running' THEN NULL ELSE heartbeat_at END,
  run_after = CASE WHEN status = 'running' THEN NOW() ELSE run_after END
WHERE source_type = 'concept_note_upload'
  AND status IN ('queued', 'running')
  AND model IS DISTINCT FROM 'direct_markdown'
`;

function transitionExistingJob(job) {
  const inFlight =
    job.sourceType === "concept_note_upload" &&
    job.model !== "direct_markdown" &&
    (job.status === "queued" || job.status === "running");
  if (!inFlight) {
    return {
      annotationMode: "none",
      status: job.status,
      leaseOwner: job.leaseOwner ?? null,
    };
  }
  return {
    annotationMode: "visual_context",
    status: "queued",
    leaseOwner: job.status === "running" ? null : (job.leaseOwner ?? null),
  };
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  IN_FLIGHT_CNB_ANNOTATION_SQL,
  transitionExistingJob,
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("PdfOcrJob", "annotation_mode", {
      type: Sequelize.STRING(32),
      allowNull: false,
      defaultValue: "none",
    });
    await queryInterface.addColumn("PdfOcrJob", "structured_s3_key", {
      type: Sequelize.STRING(1024),
      allowNull: true,
    });
    await queryInterface.addColumn("PdfOcrJob", "structured_size_bytes", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
    await queryInterface.addColumn("PdfOcrJob", "structured_sha256", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn("PdfOcrJob", "structured_schema_version", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addConstraint("PdfOcrJob", {
      fields: ["annotation_mode"],
      type: "check",
      where: {
        annotation_mode: { [Sequelize.Op.in]: ["none", "visual_context"] },
      },
      name: "PdfOcrJob_annotation_mode_check",
    });
    await queryInterface.sequelize.query(IN_FLIGHT_CNB_ANNOTATION_SQL);
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "PdfOcrJob",
      "PdfOcrJob_annotation_mode_check",
    );
    await queryInterface.removeColumn("PdfOcrJob", "structured_schema_version");
    await queryInterface.removeColumn("PdfOcrJob", "structured_sha256");
    await queryInterface.removeColumn("PdfOcrJob", "structured_size_bytes");
    await queryInterface.removeColumn("PdfOcrJob", "structured_s3_key");
    await queryInterface.removeColumn("PdfOcrJob", "annotation_mode");
  },
};
