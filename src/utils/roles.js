'use strict';

const ROLE_IDS = {
  moderationAccess: '1425569078596337745',
  helpManagementAccess: new Set(['1379199481886802061', '1470915962860736553']),
  leadOverseer: '1470915962860736553',
  moderation: {
    juniorModerator: '1435404002941472951',
    moderator: '1376295710626021505',
    seniorModerator: '1419796682123509872',
  },
  sid: {
    investigator: '1423084835219706006',
    seniorInvestigator: '1423085317866655855',
    leadInvestigator: '1423085319863144569',
  },
  osc: {
    oversightCommittee: '1470915374441693376',
    leadOverseer: '1470915962860736553',
  },
  facility: {
    communityManager: '1423081318916296926',
    assistantCommunityManager: '1449882229416132638',
    internalOperationsManager: '1423079490455605380',
    assistantInternalOperationsManager: '1436454642174267452',
    facilityAdministrationManager: '1423078855123533874',
    developmentManager: '1426901743282950257',
    assistantDevelopmentManager: '1456708048784457748',
  },
};

const MODERATION_ROLE_IDS = new Set(Object.values(ROLE_IDS.moderation));
const SID_ROLE_IDS = new Set(Object.values(ROLE_IDS.sid));
const OSC_ROLE_IDS = new Set(Object.values(ROLE_IDS.osc));
const FACILITY_ROLE_IDS = new Set(Object.values(ROLE_IDS.facility));
const ALL_STAFF_ROLE_IDS = new Set([
  ...MODERATION_ROLE_IDS,
  ...SID_ROLE_IDS,
  ...OSC_ROLE_IDS,
  ...FACILITY_ROLE_IDS,
  ROLE_IDS.moderationAccess,
]);

const MANAGEMENT_ROLE_IDS = new Set([
  ROLE_IDS.moderation.seniorModerator,
  ROLE_IDS.osc.leadOverseer,
  ...ROLE_IDS.helpManagementAccess,
]);

const MODERATION_RANK_LABELS = {
  juniorModerator: 'Junior Moderator',
  moderator: 'Moderator',
  seniorModerator: 'Senior Moderator',
};

const DEPARTMENTS = {
  moderation: {
    key: 'moderation',
    title: 'Moderation',
    roleIds: MODERATION_ROLE_IDS,
    managerRoleId: ROLE_IDS.moderation.seniorModerator,
    assistantManagerRoleId: ROLE_IDS.moderation.moderator,
    description: 'Handles community moderation, enforcement, and safety operations.',
    handbook: 'https://docs.valleycorrectional.xyz/internal-documents/moderation-division-handbook',
  },
  sid: {
    key: 'sid',
    title: 'Specialized Investigations Division (SID)',
    roleIds: SID_ROLE_IDS,
    managerRoleId: ROLE_IDS.sid.leadInvestigator,
    assistantManagerRoleId: ROLE_IDS.sid.seniorInvestigator,
    description: 'Conducts investigations, evidence reviews, and specialized internal cases.',
    handbook: 'https://docs.valleycorrectional.xyz/internal-documents/specialized-investigations-division-handbook',
  },
  osc: {
    key: 'osc',
    title: 'Oversight Committee (OSC)',
    roleIds: OSC_ROLE_IDS,
    managerRoleId: ROLE_IDS.osc.leadOverseer,
    assistantManagerRoleId: ROLE_IDS.osc.oversightCommittee,
    description: 'Provides oversight, accountability, and high-level governance for operations.',
    handbook: 'https://docs.valleycorrectional.xyz/internal-documents/oversight-committee',
  },
  facility: {
    key: 'facility',
    title: 'Facility Management',
    roleIds: FACILITY_ROLE_IDS,
    managerRoleId: ROLE_IDS.facility.communityManager,
    assistantManagerRoleId: ROLE_IDS.facility.assistantCommunityManager,
    description: 'Leads management operations across community, internal operations, administration, and development.',
    handbook: 'https://docs.valleycorrectional.xyz/internal-documents/management-division-handbook',
  },
};

function memberHasAnyRole(member, roleIds) {
  return [...roleIds].some((roleId) => member.roles.cache.has(roleId));
}

function getMemberDepartments(member) {
  return Object.values(DEPARTMENTS).filter((dept) => memberHasAnyRole(member, dept.roleIds));
}

function hasModerationAccessRole(member) {
  return member.roles.cache.has(ROLE_IDS.moderationAccess);
}

function hasManagementAccessRole(member) {
  return [...ROLE_IDS.helpManagementAccess].some((id) => member.roles.cache.has(id));
}

function hasLeadOverseerRole(member) {
  return member.roles.cache.has(ROLE_IDS.leadOverseer);
}

function hasShiftAccessRole(member) {
  return hasModerationAccessRole(member) || hasManagementAccessRole(member) || hasLeadOverseerRole(member);
}

function isDevUser(userId) {
  return userId === '757698506411475005';
}

module.exports = {
  ROLE_IDS,
  MODERATION_ROLE_IDS,
  SID_ROLE_IDS,
  OSC_ROLE_IDS,
  FACILITY_ROLE_IDS,
  ALL_STAFF_ROLE_IDS,
  MANAGEMENT_ROLE_IDS,
  MODERATION_RANK_LABELS,
  DEPARTMENTS,
  memberHasAnyRole,
  getMemberDepartments,
  hasModerationAccessRole,
  hasManagementAccessRole,
  hasLeadOverseerRole,
  hasShiftAccessRole,
  isDevUser,
};
