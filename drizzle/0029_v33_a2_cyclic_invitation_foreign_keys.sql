-- CFK-02 and CFK-09 are intentionally isolated after both sides of each cycle exist.
CREATE INDEX `organization_memberships_org_source_inv_idx`
  ON `organization_memberships` (`organizationId`, `sourceInvitationId`);
--> statement-breakpoint
ALTER TABLE `organization_memberships`
  ADD CONSTRAINT `organization_memberships_source_invitation_org_fk`
  FOREIGN KEY (`organizationId`, `sourceInvitationId`)
  REFERENCES `organization_invitations` (`organizationId`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
--> statement-breakpoint
CREATE INDEX `project_memberships_project_source_inv_idx`
  ON `project_memberships` (`projectId`, `sourceInvitationId`);
--> statement-breakpoint
ALTER TABLE `project_memberships`
  ADD CONSTRAINT `project_memberships_source_invitation_project_fk`
  FOREIGN KEY (`projectId`, `sourceInvitationId`)
  REFERENCES `project_invitations` (`projectId`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
