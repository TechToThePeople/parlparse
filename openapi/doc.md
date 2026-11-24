# Controlled vocabularies

The EP Open Data API publishes its vocabularies as concept schemes; every id the
pipeline reads — a document `work-type`, an activity type, a decision method, a
procedure type — is a member of one of them.

```sh
GET https://data.europarl.europa.eu/api/v2/controlled-vocabularies
GET https://data.europarl.europa.eu/api/v2/controlled-vocabularies/ep-document-types   # one scheme, with every member
```

| scheme | members | used for |
|---|---|---|
| [`ep-activities`](#ep-activities) | 76 | `agenda_items.kind` — `PLENARY_VOTE`, `PLENARY_DEBATE`, `MEETING_PART` (`openapi/agenda.js`) |
| [`ep-decision-methods`](#ep-decision-methods) | 8 | `rollcalls.method` — `RCV`, `HAND`, `ELECTRONIC`, `SECRET` (`openapi/decisions.js`) |
| [`ep-document-types`](#ep-document-types) | 119 | `work-type` of every document the pipeline fetches (RCV, ATT, VOT, MINUTES, agendas) |
| [`ep-entities`](#ep-entities) | 413 | authoring bodies seen in `creator` arrays — committees and national chambers |
| [`ep-procedure-types`](#ep-procedure-types) | 67 | the `(COD)`, `(INI)`, `(BUD)` suffix of `procedures.code` |
| [`ep-roles`](#ep-roles) | 86 | roles in `workHadParticipation` (rapporteur, chair, …) |
| [`ep-statuses`](#ep-statuses) | 24 | procedure phases (`current_stage` of a `procedures` row) |

## ep-activities

Taxonomy of the European Parliament on legislative activities.

76 entries, 1 deprecated (marked ⚠).

| identifier | meaning |
|---|---|
| `ANNOUNCE_PLENARY_COUNCIL_POSITION` | Council's position is announced in plenary. |
| `COMMITTEE_ACTIVITY` | Activity by a parliamentary committee. |
| `COMMITTEE_ADOPTING_OPINION` | Committee for opinion adopts its report to transmit it further to the Responsible Committee. |
| `COMMITTEE_ADOPTING_REPORT` | Responsible parliamentary committee adopt its report to table it further to plenary. |
| `COMMITTEE_APPOINT_RAPPORTEUR` | Parliamentary committee appoints a rapporteur. |
| `COMMITTEE_APPROVE_PROVISIONAL_AGREEMENT` | Responsible parliamentary committee approve provisional agreement resulting of interinstitutional negotiations. |
| `COMMITTEE_DEBATE` | Debate in the course of a meeting of a parliamentary committee. |
| `COMMITTEE_MEETING` | Parliamentary committee meeting. |
| `COMMITTEE_REJECT_PROVISIONAL_AGREEMENT` | Responsible parliamentary committee reject provisional agreement resulting of interinstitutional negotiations. |
| `COMMITTEE_TABLING_AMENDMENT` | Parliamentary committee table amendment(s) |
| `COMMITTEE_TABLING_REPORT` | Parliamentary committee table report. |
| `COMMITTEE_VOTE` | Vote in the curse of a meeting of a parliamentary committee. |
| `COMMITTEE_VOTE_PROVISIONAL_AGREEMENT` | Vote in the curse of a meeting of the Parliamentary Committee responsible on the provisional agreement issued by the interinstitutional negotiations. |
| `DELEGATION_ACTIVITY` | Activity by a parliamentary delegation. |
| `DELEGATION_ADOPT_REPORT` | Parliamentary delegation adopt its report. |
| `DELEGATION_MEETING` | Parliamentary delegation meeting. |
| `INTERINSTITUTIONAL_NEGOTIATION` | Interinstitutional negotiations. |
| `INTERINSTITUTIONAL_NEGOTIATIONS_MEETING` | Meeting for interinstitutional negotiations. |
| `MEETING_ACTIVITY` | Activity related to a meeting. |
| `MEETING_END` | Ending of a meeting or a sitting. |
| `MEETING_NAME_CHAIR` | Nomination of a chair for a meeting or a sitting. |
| `MEETING_OPEN` | Starting of a meeting or a sitting. |
| `MEETING_PART` | The European Parliament meeting part is a subdivision of a sitting or a meeting. |
| `MEETING_PART_DEBATES` | Debating part of a meeting. |
| `MEETING_PART_KEYDEBATE` | Debating part of a meeting around a key topic. |
| `MEETING_PART_SITTING` | Part of sitting meeting. |
| `MEETING_PART_SITTING_FORMAL` | Formal part of sitting meeting. |
| `MEETING_PART_VOTES` | Voting part of a meeting. |
| `MEETING_RESUME` | Resuming of a meeting or a sitting after a break. |
| `NATIONAL_CHAMBER_ACTIVITY` | Activity by a national chamber. |
| `NATIONAL_CHAMBER_SUBMIT_CONTRIBUTION` | National chambers can issue contributions to the drafting of EU law. |
| `NATIONAL_CHAMBER_SUBMIT_OPINION` | National chambers can issue reasoned opinion when they consider draft legislation does not comply with the principle of subsidiarity. |
| `PLENARY_ACTIVITY` | Activity by plenary. |
| `PLENARY_ADOPT_JOINT_TEXT` | In the scope of a procedure subject to 3rd Reading, plenary adopt the Join Text, result of the Conciliation Committee negotiations. |
| `PLENARY_ADOPT_POSITION` | Plenary adopt its position. |
| `PLENARY_AMEND` | Plenary amend a text. |
| `PLENARY_AMEND_COUNCIL_POSITION` | Plenary amend Council position. |
| `PLENARY_AMEND_PROPOSAL` | EP position at 1st reading with amendments refers to the position adopted by the European Parliament, at first reading, introducing modifications (amendments) to a given draft legislative act. |
| `PLENARY_APPROVE_COUNCIL_POSITION` | This concept is used in accordance with the Treaty: ‘Second reading — If, within 3 months of such communication, the European Parliament: (a) approves the Council’s position at first reading or has not taken a decision, the act concerned shall be deemed to have been adopted in the wording which corresponds to the position of the Council.’ |
| `PLENARY_APPROVE_REQUEST_PROCEDURE_URGENT` | Plenary voted for applying the urgent procedure. |
| `PLENARY_DEBATE` | Debates in the course of a plenary sitting of the European Parliament. |
| `PLENARY_DEBATE_SPEECH` | Speech of a debate during a plenary. |
| `PLENARY_DEBATE_WRITTEN_STATEMENT` | Written statement of a debate during a plenary. |
| `PLENARY_DECISION` | EP decision refers to a position adopted by the European Parliament on a given issue, as defined in the European Parliament’s Rules of Procedure. |
| `PLENARY_ENDORSE_COMMITTEE_INTERINSTITUTIONAL_NEGOTIATIONS` | Plenary endorse parliamentary responsible committee to enter into interinstitutional negotiations. |
| `PLENARY_OUTCOME` | Outcome of a plenary. |
| `PLENARY_PART_SESSION` | The European Parliament plenary part-session shall be the meeting of the Europeal Parliament convened as a rule each month and subdivided into daily sittings. |
| `PLENARY_PART_SESSION_DOSSIER` | Part session plenary folder. |
| `PLENARY_REFER_COMMITTEE_INTERINSTITUTIONAL_NEGOTIATIONS` | Plenary refer back the matter to parliamentary responsible committee to enter into interinstitutional negotiations. |
| `PLENARY_REFER_COMMITTEE_RECONSIDERATION` | Plenary refer back the matter to parliamentary responsible committee for reconsideration. |
| `PLENARY_REJECT_COMMITTEE_INTERINSTITUTIONAL_NEGOTIATIONS` | Plenary reject parliamentary responsible committee to enter into interinstitutional negotiations. |
| `PLENARY_REJECT_COUNCIL_POSITION` | Plenary reject Council position. |
| `PLENARY_REJECT_JOINT_TEXT` | In the scope of a procedure subject to 3rd Reading, plenary reject the Join Text, result of the Conciliation Committee negotiations. |
| `PLENARY_REJECT_PROPOSAL` | Plenary reject proposal. |
| `PLENARY_REJECT_REQUEST_PROCEDURE_URGENT` | Plenary voted against applying the urgent procedure. |
| `PLENARY_SESSION` | The European Parliament plenary session shall be the annual period prescribed by the Act and the Treaties. |
| `PLENARY_SITTING` | The European Parliament plenary sitting is a subdivision of a plenary part-session. Sittings of the Parliament held on the same day shall be deemed to be a single sitting. |
| `PLENARY_SITTING_DAY` | The sitting day indicates the day of a meeting of the plenary of the European Parliament, a parliamentary committee or parliamentary assembly. |
| `PLENARY_VOTE` | Vote in the curse of a plenary sitting of the European Parliament. |
| `PLENARY_VOTE_EXPLANATIONS` | Explanations of vote in plenary. |
| `PLENARY_VOTE_PROCEDURE_URGENT` | Plenary vote on request for applying urgent procedure. |
| `PLENARY_VOTE_RESULTS` | Results of vote in plenary. |
| `PLENARY_VOTE_URGENCY` | Urgency vote in plenary. |
| `PROCEEDING_ACTIVITY` | Proceeding activity. |
| `PUBLICATION_OFFICIAL_JOURNAL` | Text is published in the official journal on EURLex. |
| `REFERRAL` | Proposal is referred to plenary. |
| `REQUEST_CONCILIATION_COMMITTEE` | In context of budgetary and ordinary legislative procedures, when no common position is found between Parliament and Council through the first and second reading, they can convene of a third reading, requesting a conciliation committee to take place. |
| `REQUEST_PROCEDURE_URGENT` | Submission of a request to decide urgently on a proposal. |
| `REQUEST_VOTE_ROLLCALL` | Request for a vote to happen in roll call mode. |
| `REQUEST_VOTE_SEPARATE` | Request for a vote to be separated. |
| `REQUEST_VOTE_SPLIT` | Request for a vote to be split. |
| `REQUEST_VOTE_URGENCY` ⚠ | Request for an urgency vote. |
| `SIGNATURE` | Signature of a document or an act. |
| `TABLING_PLENARY` | Tabling a text for its further consideration by the plenary of the European Parliament. |
| `VOTE_EXPLANATION_ORAL` | Explanation of vote given by oral. |
| `VOTE_EXPLANATION_WRITTEN` | Explanation of vote given in writing. |

## ep-decision-methods

Taxonomy of the European Parliament on decision and vote methods.

8 entries.

| identifier | meaning |
|---|---|
| `DECISION` | A conclusion or resolution reached after consideration. |
| `VOTE` | A formal indication of a choice between two or more options, usually through a ballot or a show of hands. |
| `VOTE_ELECTRONIC` | Voting system in which voters cast their ballots by electronic means. |
| `VOTE_ELECTRONIC_ROLLCALL` | Voting method in which voters cast their ballots by electronic means in a non anonymous way. |
| `VOTE_ELECTRONIC_SECRET` | Voting method in which voters cast their ballots by electronic means, without their identity being disclosed. |
| `VOTE_HAND` | Voting method in which voters raise one hand to demonstrate their support for or opposition towards an idea. |
| `VOTE_NON_ELECTRONIC_ROLLCALL` | Voting method in whic h voters cast their ballots by non electronic means in a non anonymous way. |
| `VOTE_NON_ELECTRONIC_SECRET` | Voting method in which voters cast their ballots by non electronic means, without their identity being disclosed. |

## ep-document-types

Taxonomy of the European Parliament on document types.

119 entries, 2 deprecated (marked ⚠).

| identifier | meaning |
|---|---|
| `ACT_FOLLOWUP` | European Commission follow up document on European Parliament texts adopted. |
| `ADDENDUM` | Document presenting the corrections to be read in a text. |
| `AGENDA` | Agenda of a meeting. |
| `AGENDA_CALENDAR_PART_SESSION` | European Parliament calendar of part-sessions. |
| `AGENDA_PARLIAMENTARY_COMMITTEE` | Agenda of a parliamentary committee meeting. |
| `AGENDA_PARLIAMENTARY_DELEGATION` | Agenda of a parliamentary delegation meeting. |
| `AGENDA_PLENARY_DAY` | European Parliament plenary sitting agenda. |
| `AGENDA_PLENARY_WEEK` | European Parliament plenary part-session agenda. |
| `AGENDA_PLENARY_WEEK_DRAFT` | European Parliament plenary part-session draft agenda. |
| `AGENDA_PLENARY_WEEK_DRAFT_FINAL` | European Parliament plenary part-session draft final agenda. |
| `AGREEMENT_PROVISIONAL` | An informal agreement on an amended text of a legislative proposal reached in interinstitutional negotiations (trialogues) between the Parliament and the Council, which has to be approved by the formal procedures applicable within each institution. |
| `AMENDMENT` | Change introduced in a text in form of an addition, modification or deletion from the original source text. |
| `AMENDMENT_BUDGET_EU_CPARL` | Amendment proposed by a parliamentary committee to the draft budget of the European Union. |
| `AMENDMENT_BUDGET_EU_DRAFT` | Plenary annex containing amendments to the draft general budget of the European Union. |
| `AMENDMENT_CONSOLIDATED` | Amendment presented in its consolidated version. |
| `AMENDMENT_CPARL` | Amendment tabled to a Parliamentary committee. |
| `AMENDMENT_DOCUMENT_C` | Amendment tabled to a document issued by a EU institution (document with a C reference). |
| `AMENDMENT_LIST` | List grouping amendments. |
| `AMENDMENT_MOTION` | Amendment tabled to a motion for resolution. |
| `AMENDMENT_MOTION_JOINT` | Amendment tabled to a joint motion for resolution. |
| `AMENDMENT_PLENARY` | Amendment tabled to the European Parliament plenary. |
| `AMENDMENT_REPORT` | Amendment tabled to a plenary report. |
| `ANNEX` | Section of a text appended to its end or in a separated document. |
| `ASSESSMENT_BUDGETARY` | Text drawn up for budgetary assessment of a procedure. |
| `ASSESSMENT_BUDGETARY_DRAFT` | Draft text drawn up for budgetary assessment of a procedure. |
| `BUDGET_EP_DRAFT` | Plenary annex on provisional budget of the European Parliament. |
| `BUREAU_DECISION` | Document referring to administrative, organisational, and financial rulings made by the Bureau of the European Parliament. |
| `BUREAU_DECISION_MEMBERS` | Decision from the European Parliament Bureau to the Members. |
| `BUREAU_DOCUMENT` | Document from the European Parliament Bureau. |
| `BUREAU_NOTICE_MEMBERS` | Communication from the European Parliament Bureau. |
| `CONSOLIDATED_TEXT` | Text presenting an initial (or more) act(s) with all its subsequent amendments in a single document. |
| `CONTRIBUTION_NATIONAL_CHAMBER` | National chamber contribution document. |
| `CORRIGENDUM` | Document presenting the corrections to be read in a text. |
| `CR_MISSION` | Report about a mission. |
| `CR_MISSION_CPARL` | Parliamentary committee mission report with recommendations and conclusions. |
| `CRE_PLENARY` | European Parliament plenary sitting verbatim report of proceedings. |
| `CRE_SPEECH` | Speech in the European Parliament plenary sitting verbatim report of proceedings. |
| `DECISION` | Text binding on those to whom it is addressed and is directly applicable. |
| `DECISION_DRAFT` | Draft text binding on those to whom it is addressed and is directly applicable. |
| `DECLARATION` | Official statement. |
| `DECLARATION_WRITTEN` | Official statement in written form. |
| `DIRECTIVE` | Legislative act setting out a goal that EU countries must achieve by devising their own laws on how to reach these goals. |
| `DIRECTIVE_DRAFT` | Draft legislative act setting out a goal that EU countries must achieve by devising their own laws on how to reach these goals. |
| `DOCUMENT` | Piece of official information. |
| `DOCUMENT_C_REFERENCE` | European Parliament's reference for a document emitted by another institution. |
| `DOCUMENT_STAFF_WORKING` | Staff working document |
| `DOCUMENT_WORKING` | Working document. |
| `DOCUMENT_WORKING_CPARL` | Parliamentary committee working document. |
| `EP_SUPPORTING_ANALYSE` | European Parliament supporting analysis. |
| `ERRATUM` | A mistake in a printed or written document |
| `FACTSHEET` | Written document containing useful information and facts on a given topic. |
| `INTERPELLATION_MAJOR` | European Parliament major interpellation. |
| `INTERPELLATION_MINOR` | European Parliament minor interpellation. |
| `INTERPELLATION_MINOR_WRITTEN_ANSWER` | Written answer to an European Parliament minor interpellation. |
| `JOURNAL_OFFICIAL` | Official gazette publishing daily the core part of the EU law. |
| `LETTER` | Written message sent to adressee(s). |
| `LETTER_AGREEMENT` | Letter between the Council of the European Union and the European Parliament to officialise exchange of a provisional agreement in view of its further examination by the plenary. |
| `LETTER_REFERRAL` | Letter to officialise exchange of a text in view of its further examination by the adressees. |
| `LIST_ATTEND_PLENARY` | List of members attending a plenary sitting of the European Parliament. |
| `MANDATE` ⚠ | Propoosal for a decision on the opening of, and on the mandate for, interninstitutional negotiations. |
| `MEMBER_DECLARATION` | Document completed by Members to declare elements in compliance with the code of conduct. |
| `MEMBER_DECLARATION_ATTENDANCE_EVENT` | Document completed by Members to declare, in compliance with the code of conduct, that their travel costs have been reimbursed or paid by a third party. |
| `MEMBER_DECLARATION_BEHAVIOUR` | Document completed by Members to confirm their commitment to comply with the code of appropriate behaviour. |
| `MEMBER_DECLARATION_EXPENDITURE` | Document completed by Members to confirm that their use of the General Expenditure Allowance complies with the applicable rules of the Statute for Members and its implementing measures. |
| `MEMBER_DECLARATION_INTEREST_CONFLICT` | Document completed by Members to declare their conflicts of interests in compliance with their code of conduct. |
| `MEMBER_DECLARATION_INTEREST_PRIVATE` | Document completed by Members to declare their private interests in compliance with the code of conduct. |
| `MINUTES` | Written record of a meeting. |
| `MINUTES_PARLIAMENTARY_COMMITTEE` | Written record of a parliamentary committee meeting. |
| `MINUTES_PARLIAMENTARY_DELEGATION` | Written record of a parliamentary delegation meeting. |
| `MINUTES_PLENARY` | European Parliament plenary sitting minutes |
| `NOTICE_MEMBERS` | Communication to Members. |
| `NOTICE_MEMBERS_PETI` | Communication to Members in the context of petitions. |
| `OPINION` | Instrument allowing the institutions to make a statement in a non-binding fashion, in other words without imposing any legal obligation. |
| `OPINION_LETTER_PARLIAMENTARY_COMMITTEE` | Statement given in form of a letter by a parliamentary committee for opinion to the responsible committee. |
| `OPINION_NATIONAL_PARLIAMENT` | Reasoned opinion of national Parliament |
| `OPINION_PARLIAMENTARY_COMMITTEE` | Statement usually containing amendments to the proposal given by a parliamentary committee for opinion to the responsible committee. |
| `OPINION_PARLIAMENTARY_COMMITTEE_DA_IA_USE` | Statement about the use of delegated act and conferral of implementign powers given by the JURI committee for opinion to the responsible committee. |
| `OPINION_PARLIAMENTARY_COMMITTEE_DRAFT` | Draft statement usually containing amendments to the proposal given by a parliamentary committee for opinion to the responsible committee. |
| `OPINION_PARLIAMENTARY_COMMITTEE_HUMAN_RIGHTS` | Statement about the procedure's respect for fundamental rights given by the LIBE committee for opinion to the responsible committee. |
| `OPINION_PARLIAMENTARY_COMMITTEE_LEGAL_BASIS` | Statement about the procedure's legal basis given by the JURI committee for opinion to the responsible committee. |
| `OPINION_PARLIAMENTARY_COMMITTEE_RECAST_TECHNIQUE` | Statement about the procedure's recasting technique given by the JURI committee for opinion to the responsible committee. |
| `PROCEDURE_RULES` | Text laying down accepted rules, ethics and customs governing proceedings and meetings of the European Parliament. |
| `PROPOSAL_ACT_UNION` ⚠ | Proposal for an Union Act. |
| `QUESTION_INTERPELLATION` | European Parliament question and interpellation. |
| `QUESTION_INTERPELLATION_ANSWER_WRITTEN` | Written answer to an European Parliament question or interpellation. |
| `QUESTION_ORAL` | Oral question tabled to the plenary of the European Parliament. |
| `QUESTION_RESOLUTION_MOTION` | Motion for resolution grouping the oral questions tabled to a sitting of the European Parliament. |
| `QUESTION_TIME` | Question tabled to question time of the plenary sitting of the European Parliament. |
| `QUESTION_WRITTEN` | Question in a written form. |
| `QUESTION_WRITTEN_ANSWER` | Written answer to a question in a written form. |
| `QUESTION_WRITTEN_PRIORITY` | Priority question in a written form. |
| `RECOMMENDATION` | Text allowing the institutions to make their views known and to suggest a line of action without imposing any legal obligation on those to whom it is addressed. |
| `RECOMMENDATION_DRAFT` | Draft text allowing the institutions to make their views known and to suggest a line of action without imposing any legal obligation on those to whom it is addressed. |
| `REGULATION` | Binding legislative act which must be applied in its entirety across the EU. |
| `REGULATION-DRAFT` | Draft binding legislative act which must be applied in its entirety across the EU. |
| `REPORT` | To give a description of something or information about it to someone |
| `REPORT_JOINT` | Text drawn up by two or three parliamentary committees on a subject in a view of a debate and a vote. |
| `REPORT_NON_LEGISLATIVE_STRATEGIC` | Text drawn up on the own initiative of the European Parliament on a non-legislative subject in a view of a debate and a vote with strategic impact. |
| `REPORT_OWN_INITIATIVE` | Text drawn up on the own initiative of the European Parliament on a subject in a view of a debate and a vote. |
| `REPORT_PARLIAMENTARY_COMMITTEE_DRAFT` | Draft text drawn up by a parliamentary committee on a subject in a view of a debate and a vote. |
| `REPORT_PLENARY` | Text drawn up by a member, a group of members or a parliamentary committee on a subject in a view of a debate and a vote by the European Parliament plenary. |
| `RESOLUTION` | Text in which a body expresses an opinion or a purpose with respect to a given matter or topic that is temporary in nature. |
| `RESOLUTION_DRAFT` | Draft text in which a body expresses an opinion or a purpose with respect to a given matter or topic that is temporary in nature. |
| `RESOLUTION_LEGISLATIVE` | Text in which a body expresses an opinion or a purpose with respect to a given matter or topic that is temporary in nature. |
| `RESOLUTION_MOTION` | Text declaring European Parliament's opinion on a matter tabled on a topical issue, at the request of a committee, a political group or members and voted in plenary. |
| `RESOLUTION_MOTION_DRAFT` | Draft text declaring European Parliament's opinion on a matter tabled on a topical issue, at the request of a committee, a political group or members and voted in plenary. |
| `RESOLUTION_MOTION_JOINT` | Text declaring European Parliament's opinion on a matter tabled on a topical issue, at the jointly request of committee(s)or political group(s) and voted in plenary. |
| `STUDY` | Written document examining a subject in details. |
| `STUDY_BRIEFING` | Written document examining a subject in a brief manner. |
| `STUDY_CATALOG` | Listing of available items. |
| `STUDY_DEPTH_ANALYSIS` | Written document investigating a problem or issue in great detail. |
| `STUDY_GLANCE` | Written document giving immediate information on a subject with only a quick look. |
| `TEXT_ADOPTED` | Text adopted by a vote in the plenary of the European Parliament. |
| `TEXT_JOINT` | Joint text. |
| `VOTE_EXPLANATION_PLENARY` | Justification for some amendment to vote record in the written record of a plenary sitting of the European Parliament. |
| `VOTE_RESULT_PLENARY` | Result of a vote in the written record of a plenary sitting of the European Parliament. |
| `VOTE_RESULTS_PLENARY` | Results of votes in the written record of a plenary sitting of the European Parliament. |
| `VOTE_ROLLCALL_CPARL` | Results of roll-call votes in the written record of a meeting of a parliamentary committee. |
| `VOTE_ROLLCALL_PLENARY` | Results of roll-call votes in the written record of a plenary sitting of the European Parliament. |

## ep-entities

Taxonomy of the European Parliament on entities.

413 entries, 111 deprecated (marked ⚠).

| identifier | meaning |
|---|---|
| `AUSTRIAN_FEDERAL_COUNCIL` | Austrian Federal Council. |
| `AUSTRIAN_NATIONAL_COUNCIL` | Austrian National Council. |
| `BELGIAN_CHAMBER_REPRESENTATIVES` | Belgian Chamber of Representatives. |
| `BELGIAN_SENATE` | Belgian Senate. |
| `BULGARIAN_PARLIAMENT` | Bulgarian Parliament. |
| `BUREAU` | Bureau of the European Parliament. |
| `COMMITTEE_PARLIAMENTARY` | Parliamentary Committee of the European Parliament. |
| `COMMITTEE_PARLIAMENTARY_CONCILIATION` | Conciliation Committee. |
| `COMMITTEE_PARLIAMENTARY_CONCILIATION_BUDGET` | European Parliament Budgetary Conciliation Committee. |
| `COMMITTEE_PARLIAMENTARY_JOINT` | Joint parliamentary committees of the European Parliament. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFCO_AFET` | Joint committee procedure - AFET and AFCO. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFCO_AFET_INTA` | Joint committee procedure - AFET - INTA - AFCO. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFCO_ECON` | Joint committee procedure - ECON and AFCO. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFCO_JURI` | Joint committee procedure - JURI and AFCO. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFCO_JURI_LIBE` | Joint committee procedure - JURI - LIBE - AFCO. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFCO_PETI` | Joint committee procedure - AFCO and PETI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFCO_SEDE` | Joint committee procedure - AFCO and SEDE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFET_BUDG` | Joint committee procedure - AFET and BUDG. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFET_BUDG_DEVE` | Joint committee procedure - AFET - DEVE - BUDG. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFET_CULT` | Joint committee procedure - AFET and CULT. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFET_DEVE` | Joint committee procedure - AFET and DEVE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFET_ENVI` | Joint committee procedure - AFET and ENVI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFET_INTA` | Joint committee procedure - AFET and INTA. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFET_ITRE` | Joint committee procedure - AFET and ITRE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AFET_LIBE` | Joint committee procedure - AFET and LIBE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AGRI_AGRI` | Joint committee procedure - TRAN and AGRI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AGRI_BUDG_REGI` | Joint committee procedure - AGRI, BUDG and REGI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AGRI_EMPL_ENVI` | Joint committee procedure - AGRI, EMPL and ENVI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AGRI_EMPL_REGI` | Joint committee procedure - AGRI, EMPL and REGI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AGRI_ENVI` | Joint committee procedure - ENVI and AGRI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AGRI_FEMM` | Joint committee procedure - AGRI and FEMM. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AGRI_JURI` | Joint committee procedure - AGRI and JURI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_AGRI_REGI` | Joint committee procedure - AGRI and REGI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_BUDG_CONT` | Joint committee procedure - BUDG and CONT. |
| `COMMITTEE_PARLIAMENTARY_JOINT_BUDG_ECON` | Joint committee procedure - BUDG and ECON. |
| `COMMITTEE_PARLIAMENTARY_JOINT_BUDG_INTA_SEDE` | Joint committee procedure - BUDG, INTA and SEDE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_BUDG_ITRE` | Joint committee procedure - BUDG and ITRE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_CONT_LIBE` | Joint committee procedure - CONT and LIBE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_CULT_EMPL` | Joint committee procedure - EMPL and CULT. |
| `COMMITTEE_PARLIAMENTARY_JOINT_CULT_ITRE` | Joint committee procedure - ITRE and CULT. |
| `COMMITTEE_PARLIAMENTARY_JOINT_CULT_LIBE` | Joint committee procedure - CULT and LIBE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_DEVE_ENVI` | Joint committee procedure - DEVE and ENVI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_DEVE_FEMM` | Joint committee procedure - DEVE and FEMM. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ECON_ENVI` | Joint committee procedure - ECON and ENVI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ECON_ENVI_JURI` | Joint committee procedure - ECON, ENVI and JURI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ECON_ENVI_LIBE` | Joint committee procedure - ECON, ENVI and LIBE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ECON_FEMM` | Joint committee procedure - ECON and FEMM. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ECON_IMCO` | Joint committee procedure - ECON and IMCO. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ECON_JURI` | Joint committee procedure - ECON and JURI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ECON_LIBE` | Joint committee procedure - ECON and LIBE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_EMPL_ENVI` | Joint committee procedure - EMPL and ENVI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_EMPL_FEMM` | Joint committee procedure - EMPL and FEMM. |
| `COMMITTEE_PARLIAMENTARY_JOINT_EMPL_IMCO` | Joint committee procedure - EMPL and IMCO. |
| `COMMITTEE_PARLIAMENTARY_JOINT_EMPL_IMCO_ITRE` | Joint committee procedure - EMPL, IMCO and ITRE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_EMPL_LIBE` | Joint committee procedure - EMPL and LIBE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_EMPL_REGI` | Joint committee procedure - EMPL and REGI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_EMPL_SANT` | Joint committee procedure - EMPL and SANT. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ENVI_IMCO` | Joint committee procedure - ENVI and IMCO. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ENVI_IMCO_TRAN` | Joint committee procedure - ENVI and IMCO. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ENVI_INTA` | Joint committee procedure - ENVI and INTA. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ENVI_ITRE` | Joint committee procedure - ENVI and ITRE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ENVI_ITRE_JURI` | Joint committee procedure - ENVI ITRE and JURI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ENVI_ITRE_SEDE` | Joint committee procedure - ENVI ITRE and SEDE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ENVI_LIBE` | Joint committee procedure - ENVI and LIBE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ENVI_PECH` | Joint committee procedure - ENVI and PECH. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ENVI_SANT` | Joint committee procedure - ENVI and SANT. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ENVI_SEDE` | Joint committee procedure - ENVI and SEDE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ENVI_TRAN` | Joint committee procedure - ENVI and TRAN. |
| `COMMITTEE_PARLIAMENTARY_JOINT_FEMM_INTA` | Joint committee procedure - INTA and FEMM. |
| `COMMITTEE_PARLIAMENTARY_JOINT_FEMM_JURI` | Joint committee procedure - JURI and FEMM. |
| `COMMITTEE_PARLIAMENTARY_JOINT_FEMM_PECH` | Joint committee procedure - PECH and FEMM. |
| `COMMITTEE_PARLIAMENTARY_JOINT_IMCO_INTA` | Joint committee procedure - INTA and IMCO. |
| `COMMITTEE_PARLIAMENTARY_JOINT_IMCO_INTA_ITRE` | Joint committee procedure - ITRE, INTA and IMCO. |
| `COMMITTEE_PARLIAMENTARY_JOINT_IMCO_ITRE` | Joint committee procedure - ITRE and IMCO. |
| `COMMITTEE_PARLIAMENTARY_JOINT_IMCO_JURI` | Joint committee procedure - IMCO and JURI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_IMCO_LIBE` | Joint committee procedure - IMCO and LIBE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_IMCO_SEDE` | Joint committee procedure - IMCO and SEDE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_IMCO_TRAN` | Joint committee procedure - IMCO and TRAN. |
| `COMMITTEE_PARLIAMENTARY_JOINT_INTA_ITRE` | Joint committee procedure - INTA and ITRE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_INTA_LIBE` | Joint committee procedure - INTA and LIBE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ITRE_LIBE` | Joint committee procedure - ITRE and LIBE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ITRE_REGI` | Joint committee procedure - ITRE and REGI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ITRE_SANT` | Joint committee procedure - ITRE and SANT. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ITRE_SEDE` | Joint committee procedure - ITRE and SEDE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_ITRE_TRAN` | Joint committee procedure - ITRE and TRAN. |
| `COMMITTEE_PARLIAMENTARY_JOINT_JURI_LIBE` | Joint committee procedure - JURI and LIBE. |
| `COMMITTEE_PARLIAMENTARY_JOINT_LIBE_PETI` | Joint committee procedure - LIBE and PETI. |
| `COMMITTEE_PARLIAMENTARY_JOINT_LIBE_SANT` | Joint committee procedure - LIBE and SANT. |
| `COMMITTEE_PARLIAMENTARY_JOINT_LIBE_TRAN` | Joint committee procedure - LIBE and TRAN. |
| `COMMITTEE_PARLIAMENTARY_JOINT_SEDE_TRAN` | Joint committee procedure - SEDE and TRAN. |
| `COMMITTEE_PARLIAMENTARY_LEGISLATIVE` | Temporary parliamentary legislative committee of the European Parliament. |
| `COMMITTEE_PARLIAMENTARY_SPECIAL` | Special Parliamentary Committee of the European Parliament. |
| `COMMITTEE_PARLIAMENTARY_SPECIAL_AIDA` ⚠ | With the goal of setting out a long-term EU roadmap on Artificial Intelligence (AI), AIDA will study the impact and challenges of rolling out AI, identify common EU-wide objectives, and propose recommendations on the best ways forward. |
| `COMMITTEE_PARLIAMENTARY_SPECIAL_BECA` ⚠ | BECA aims to establish a set of concrete recommendations for the member states and the EU institutions in order to strengthen our resilience against cancer. |
| `COMMITTEE_PARLIAMENTARY_SPECIAL_COVI` ⚠ | The COVI Committee has been tasked with looking into how the Union's response to the pandemic and the lessons learned can contribute to future action. The work will focus on four key pillars: health, democracy and fundamental rights, societal and economic impact, and the EU and the World. |
| `COMMITTEE_PARLIAMENTARY_SPECIAL_CRIM` ⚠ | Its purpose is both to study and analyse these criminal activities and to draw up a comprehensive, structured plan to combat the organised crime, mafias and criminal systems at EU level. |
| `COMMITTEE_PARLIAMENTARY_SPECIAL_CRIS` ⚠ | The CRIS Committee focuses on analyzing the causes and consequences of the crisis, the costs of inaction, and possible ways to overcome the crisis and to prevent a repeat. |
| `COMMITTEE_PARLIAMENTARY_SPECIAL_EUDS` | Special committee on the European Democracy Shield. |
| `COMMITTEE_PARLIAMENTARY_SPECIAL_HOUS` | Special committee on the Housing crisis in the European Union. |
| `COMMITTEE_PARLIAMENTARY_SPECIAL_INGE` ⚠ | The creation of the Special Committee for foreign interference in all democratic processes in the EU, including disinformation (INGE) is a message, a very clear alert message sent to all foreign powers trying to interfere in the democratic institutions and processes of the EU and its Members States. |
| `COMMITTEE_PARLIAMENTARY_SPECIAL_PEST` ⚠ | The Committee will assess the EU's pesticide authorisation procedure, its independence vis-à-vis the pesticide industry, the transparency of the decision-making process and the implementation methods, and put forward specific proposals to improve procedures. It will also examine the roles of the all the bodies involved: the relevant national authorities, the European Commission and the European Food Safety Authority (EFSA), whose methods will also be evaluated. |
| `COMMITTEE_PARLIAMENTARY_SPECIAL_SURE` ⚠ | SURE defines the European Parliament's political priorities for the new post-2013 multiannual financial framework, both in legislative and budgetary terms and to submit guidelines for the resources necessary for the Union to implement these priorities. |
| `COMMITTEE_PARLIAMENTARY_SPECIAL_TAXE` ⚠ | TAXE will notably look into the compatibility of tax rulings, which basically aim at clarifying in advance how to interpret and apply national tax legislation, with State Aid rules and taxation law.(PANA, TAXE, TAX2, TAX3). |
| `COMMITTEE_PARLIAMENTARY_SPECIAL_TERR` ⚠ | The TERR Special Committee aims to make a significant contribution to improving the efficiency of Europe's capacity to respond to and combat terrorism. |
| `COMMITTEE_PARLIAMENTARY_STANDING` | Standing Parliamentary Committee of the European Parliament. |
| `COMMITTEE_PARLIAMENTARY_STANDING_AFCO` | European parliamentary committee on constitutional affairs. |
| `COMMITTEE_PARLIAMENTARY_STANDING_AFET` | European parliamentary committee on foreign affairs. |
| `COMMITTEE_PARLIAMENTARY_STANDING_AGRI` | European parliamentary committee on agriculture and rural development. |
| `COMMITTEE_PARLIAMENTARY_STANDING_ASOC` ⚠ | European parliamentary committee on employment and social affairs. |
| `COMMITTEE_PARLIAMENTARY_STANDING_BUDG` | European parliamentary committee on budgets. |
| `COMMITTEE_PARLIAMENTARY_STANDING_CONT` | European parliamentary committee on budgetary control. |
| `COMMITTEE_PARLIAMENTARY_STANDING_CULT` | European parliamentary committee on culture and education. |
| `COMMITTEE_PARLIAMENTARY_STANDING_DEVE` | European parliamentary committee on development. |
| `COMMITTEE_PARLIAMENTARY_STANDING_ECON` | European parliamentary committee on economic and monetary affairs. |
| `COMMITTEE_PARLIAMENTARY_STANDING_EMPL` | European parliamentary committee on employment and social affairs. |
| `COMMITTEE_PARLIAMENTARY_STANDING_ENER` ⚠ | European parliamentary committee on research, technology and energy. |
| `COMMITTEE_PARLIAMENTARY_STANDING_ENVI` | European parliamentary committee on the environment, climate and food safety. |
| `COMMITTEE_PARLIAMENTARY_STANDING_FEMM` | European parliamentary committee on women’s rights and gender equality. |
| `COMMITTEE_PARLIAMENTARY_STANDING_IMCO` | European parliamentary committee on the internal market and consumer protection. |
| `COMMITTEE_PARLIAMENTARY_STANDING_INST` ⚠ | European parliamentary committee on institutional affairs. |
| `COMMITTEE_PARLIAMENTARY_STANDING_INTA` | European parliamentary committee on international trade. |
| `COMMITTEE_PARLIAMENTARY_STANDING_ITRE` | European parliamentary committee on industry, research and energy. |
| `COMMITTEE_PARLIAMENTARY_STANDING_JEUN` ⚠ | European parliamentary committee on culture, youth, education and the media. |
| `COMMITTEE_PARLIAMENTARY_STANDING_JURI` | European parliamentary committee on legal affairs. |
| `COMMITTEE_PARLIAMENTARY_STANDING_LIBE` | European parliamentary committee on civil liberties, justice and home affairs. |
| `COMMITTEE_PARLIAMENTARY_STANDING_PECH` | European parliamentary committee on fisheries. |
| `COMMITTEE_PARLIAMENTARY_STANDING_PETI` | European parliamentary committee on petitions. |
| `COMMITTEE_PARLIAMENTARY_STANDING_POLI` ⚠ | European parliamentary committee on foreign affairs. |
| `COMMITTEE_PARLIAMENTARY_STANDING_RECH` ⚠ | European parliamentary committee on research, technology and energy. |
| `COMMITTEE_PARLIAMENTARY_STANDING_REGI` | European parliament committee on regional development. |
| `COMMITTEE_PARLIAMENTARY_STANDING_REGL` ⚠ | European parliamentary committee on Rules of Procedure, the verification of credentials and immunities. |
| `COMMITTEE_PARLIAMENTARY_STANDING_RELA` ⚠ | European parliamentary committee on external economic relations. |
| `COMMITTEE_PARLIAMENTARY_STANDING_RETT` ⚠ | European parliamentary committee on regional policy, transport and tourism. |
| `COMMITTEE_PARLIAMENTARY_STANDING_SANT` | European parliamentary committee on public health. |
| `COMMITTEE_PARLIAMENTARY_STANDING_SEDE` | European parliamentary committee on security and defence. |
| `COMMITTEE_PARLIAMENTARY_STANDING_TRAN` | European parliamentary committee on transport and tourism. |
| `COMMITTEE_PARLIAMENTARY_SUB` | Parliamentary subcommittee of the European Parliament. |
| `COMMITTEE_PARLIAMENTARY_SUB_DROI` | European parliamentary subcommittee on human rights. |
| `COMMITTEE_PARLIAMENTARY_SUB_FISC` | European parliamentary subcommittee on tax matters. |
| `COMMITTEE_PARLIAMENTARY_SUB_MONE` ⚠ | Euroepan parliamentary subcommittee on monetary affairs. |
| `COMMITTEE_PARLIAMENTARY_SUB_PECH` ⚠ | European parliamentary subcommittee on fisheries. |
| `COMMITTEE_PARLIAMENTARY_SUB_SANT` ⚠ | European parliamentary subcommittee on public health. |
| `COMMITTEE_PARLIAMENTARY_SUB_SEDE` ⚠ | European parliamentary subcommittee on security and defence. |
| `COMMITTEE_PARLIAMENTARY_TEMPORARY` | European temporary parliamentary committee. |
| `COMMITTEE_PARLIAMENTARY_TEMPORARY_BSE` ⚠ | European temporary parliamentary committee of inquiry into BSE. |
| `COMMITTEE_PARLIAMENTARY_TEMPORARY_CLIM` ⚠ | European temporary parliamentary committee on climate change. |
| `COMMITTEE_PARLIAMENTARY_TEMPORARY_ECHE` ⚠ | European temporary parliamentary committee on the Echelon interception system. |
| `COMMITTEE_PARLIAMENTARY_TEMPORARY_EMPT` ⚠ | Temporary committee on employment. |
| `COMMITTEE_PARLIAMENTARY_TEMPORARY_EQUI` ⚠ | Committee of Inquiry into the crisis of the Equitable Life Assurance Society. |
| `COMMITTEE_PARLIAMENTARY_TEMPORARY_FEMM` ⚠ | European temporary parliamentary committee of inquiry into the situation of women in Europe. |
| `COMMITTEE_PARLIAMENTARY_TEMPORARY_FIAP` ⚠ | European temporary parliamentary committee on foot and mouth disease. |
| `COMMITTEE_PARLIAMENTARY_TEMPORARY_FINP` ⚠ | European temporary parliamentary committee on policy challenges and budgetary means of the enlarged Union 2007-2013. |
| `COMMITTEE_PARLIAMENTARY_TEMPORARY_GENE` ⚠ | European temporary parliamentary committee on human genetics and other new technologies in modern medicine. |
| `COMMITTEE_PARLIAMENTARY_TEMPORARY_MARE` ⚠ | European temporary parliamentary committee on improving safety at sea. |
| `COMMITTEE_PARLIAMENTARY_TEMPORARY_TDIP` ⚠ | European temporary parliamentary committee on the alleged use of European countries by the CIA for the transport and illegal detention of prisoners. |
| `COMMITTEE_PARLIAMENTARY_TEMPORARY_TRANSIT` ⚠ | European temporary parliamentary committee on the alleged use of European countries by the CIA for the transport and illegal detention of prisoners. |
| `CONFERENCE_CHAIRS_COMMITTEE` | Conference of Committee Chairs. |
| `CONFERENCE_CHAIRS_DELEGATION` | Conference of Delegation Chairs. |
| `CONFERENCE_PRESIDENTS` | Conference of Presidents. |
| `CROATIAN_PARLIAMENT` | Croatian Parliament. |
| `CYPRIOT_PARLIAMENT` | Cypriot Parliament. |
| `CZECH_CHAMBER_DEPUTIES` | Czech Chamber of Deputies. |
| `CZECH_SENATE` | Czech Senate. |
| `DAIL_EIREANN` | Dáil Éireann. |
| `DANISH_PARLIAMENT` | Danish Parliament. |
| `DELEGATION_JOINT_COMMITTEE` | Delegation to Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DALB` | Delegation to the EU-Albania Stabilisation and Association Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DAUT` ⚠ | Delegation to the EU-Austria Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DBUL` ⚠ | Delegation to the EU-Bulgaria Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DCAR` | Delegation to the Cariforum-EU Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DCHI` | Delegation to the EU-Chile Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DCYP` ⚠ | Delegation to the EU-Cyprus Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DCZE` ⚠ | Delegation to the EU-Czech Republic Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DEEA` ⚠ | Delegation to the European Economic Area Joint Parliamentary Committee (EEA). |
| `DELEGATION_JOINT_COMMITTEE_DEST` ⚠ | Delegation to the EU-Estonia Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DFIN` ⚠ | Delegation to the EU-Finland Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DGBR` | Delegation to the EU-UK Parliamentary Partnership Assembly. |
| `DELEGATION_JOINT_COMMITTEE_DGRE` ⚠ | Delegation to the EEC-Greece Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DHRV` ⚠ | Delegation to the EU-Croatia Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DHUN` ⚠ | Delegation to the EU-Hungary Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DLTU` ⚠ | Delegation to the EU-Lithuania Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DLVA` ⚠ | Delegation to the EU-Latvia Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DMEX` | Delegation to the EU-Mexico Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DMKD` | Delegation to the EU-North Macedonia Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DMLT` ⚠ | Delegation to the EU-Malta Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DMNE` | Delegation to the EU-Montenegro Stabilisation and Association Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DNOR` ⚠ | Delegation to the EU-Norway Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DPOL` ⚠ | Delegation to the EU-Poland Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DPRT` ⚠ | Delegation to the European Parliament/Portuguese Parliament Joint Committee. |
| `DELEGATION_JOINT_COMMITTEE_DROM` ⚠ | Delegation to the EU-Romania Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DSRB` | Delegation to the EU-Serbia Stabilisation and Association Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DSVK` ⚠ | Delegation to the EU-Slovak Republic Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DSVN` ⚠ | Delegation to the EU-Slovenia Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DSWE` ⚠ | Delegation to the EU-Sweden Joint Parliamentary Committee. |
| `DELEGATION_JOINT_COMMITTEE_DTUR` | Delegation to the EU-Türkiye Joint Parliamentary Committee. |
| `DELEGATION_PARLIAMENTARY` | Parliamentary Delegation of the European Parliament. |
| `DELEGATION_PARLIAMENTARY_ASSEMBLY` | Delegation to Parliamentary assembly. |
| `DELEGATION_PARLIAMENTARY_ASSEMBLY_DACP` | Delegation to the OACPS-EU Joint Parliamentary Assembly. |
| `DELEGATION_PARLIAMENTARY_ASSEMBLY_DAFR` | Delegation to the Africa-EU Parliamentary Assembly. |
| `DELEGATION_PARLIAMENTARY_ASSEMBLY_DCAB` | Delegation to the Caribbean-EU Parliamentary Assembly. |
| `DELEGATION_PARLIAMENTARY_ASSEMBLY_DEPA` | Delegation to the Euronest Parliamentary Assembly. |
| `DELEGATION_PARLIAMENTARY_ASSEMBLY_DLAT` | Delegation to the Euro-Latin American Parliamentary Assembly. |
| `DELEGATION_PARLIAMENTARY_ASSEMBLY_DMED` | Delegation to the Parliamentary Assembly of the Union for the Mediterranean. |
| `DELEGATION_PARLIAMENTARY_ASSEMBLY_DNAT` | Delegation for relations with the NATO Parliamentary Assembly. |
| `DELEGATION_PARLIAMENTARY_ASSEMBLY_DPAC` | Delegation to the Pacific-EU Parliamentary Assembly. |
| `DELEGATION_PARLIAMENTARY_DABR` ⚠ | Delegation for relations with Albania, Bulgaria and Romania. |
| `DELEGATION_PARLIAMENTARY_DAND` | Delegation for relations with the countries of the Andean Community. |
| `DELEGATION_PARLIAMENTARY_DANZ` | Delegation for relations with Australia and New Zealand. |
| `DELEGATION_PARLIAMENTARY_DARP` ⚠ | Delegation for relations with the Arab Peninsula. |
| `DELEGATION_PARLIAMENTARY_DASEAN` ⚠ | Delegation for relations with the Member States of ASEAN, south-east Asia and the Republic of Korea. |
| `DELEGATION_PARLIAMENTARY_DAUT` ⚠ | Delegation for relations with Austria. |
| `DELEGATION_PARLIAMENTARY_DBR` | Delegation for relations with the Federative Republic of Brazil. |
| `DELEGATION_PARLIAMENTARY_DBURO` ⚠ | Delegation for relations with Bulgaria and Romania. |
| `DELEGATION_PARLIAMENTARY_DBUROAL` ⚠ | Delegation for relations with Bulgaria, Romania and Albania. |
| `DELEGATION_PARLIAMENTARY_DCA` | Delegation for relations with Canada. |
| `DELEGATION_PARLIAMENTARY_DCAM` | Delegation for relations with the countries of Central America. |
| `DELEGATION_PARLIAMENTARY_DCAS` | Delegation to the EU-Kazakhstan, EU-Kyrgyzstan, EU-Uzbekistan and EU-Tajikistan Parliamentary Cooperation Committees and for relations with Turkmenistan and Mongolia. |
| `DELEGATION_PARLIAMENTARY_DCIS` ⚠ | Delegation for relations with the Republics of the Commonwealth of Independent States (CIS). |
| `DELEGATION_PARLIAMENTARY_DCN` | Delegation for relations with the People's Republic of China. |
| `DELEGATION_PARLIAMENTARY_DCSS` ⚠ | Delegation for relations with the Czech Republic, the Slovak Republic and Slovenia. |
| `DELEGATION_PARLIAMENTARY_DCYP` ⚠ | Delegation for relations with Cyprus. |
| `DELEGATION_PARLIAMENTARY_DCZE` ⚠ | Delegation for relations with Czechoslovakia. |
| `DELEGATION_PARLIAMENTARY_DDBY` | Delegation for relations with Belarus. |
| `DELEGATION_PARLIAMENTARY_DEEA` | Delegation for Northern cooperation and for relations with Switzerland and Norway and to the EU-Iceland Joint Parliamentary Committee and the European Economic Area (EEA) Joint Parliamentary Committee. |
| `DELEGATION_PARLIAMENTARY_DEFTA` ⚠ | Delegation for relations with the Committee of EFTA Parliamentarians. |
| `DELEGATION_PARLIAMENTARY_DELL` ⚠ | Delegation for relations with Estonia, Lithuania and Latvia. |
| `DELEGATION_PARLIAMENTARY_DEST` ⚠ | Delegation for relations with Estonia. |
| `DELEGATION_PARLIAMENTARY_DFIN` ⚠ | Delegation for relations with Finland. |
| `DELEGATION_PARLIAMENTARY_DGUL` ⚠ | Delegation for relations with the Gulf States, including Yemen. |
| `DELEGATION_PARLIAMENTARY_DGULF` ⚠ | Delegation for relations with the Gulf States. |
| `DELEGATION_PARLIAMENTARY_DGULFCC` ⚠ | Delegation for relations with the Gulf States and the Gulf Cooperation Council. |
| `DELEGATION_PARLIAMENTARY_DHUN` ⚠ | Delegation for relations with Hungary. |
| `DELEGATION_PARLIAMENTARY_DIND` | Delegation for relations with India. |
| `DELEGATION_PARLIAMENTARY_DIRN` | Delegation for relations with Iran. |
| `DELEGATION_PARLIAMENTARY_DIRQ` | Delegation for relations with Iraq. |
| `DELEGATION_PARLIAMENTARY_DISL` ⚠ | Delegation for relations with Iceland. |
| `DELEGATION_PARLIAMENTARY_DISR` | Delegation for relations with Israel. |
| `DELEGATION_PARLIAMENTARY_DJAP` | Delegation for relations with Japan. |
| `DELEGATION_PARLIAMENTARY_DREE` ⚠ | Delegation for relations with the countries of Eastern Europe. |
| `DELEGATION_PARLIAMENTARY_DREE1` ⚠ | Delegation for relations with the countries of Eastern Europe - Group I. |
| `DELEGATION_PARLIAMENTARY_DREE2` ⚠ | Delegation for relations with the countries of Eastern Europe - Group II. |
| `DELEGATION_PARLIAMENTARY_DRUS` ⚠ | Delegation to the EU-Russia Parliamentary Cooperation Committee. |
| `DELEGATION_PARLIAMENTARY_DSCA` ⚠ | Delegation to the EU-Armenia, EU-Azerbaijan and EU-Georgia Parliamentary Cooperation Committees. |
| `DELEGATION_PARLIAMENTARY_DSEE` | Delegation for relations with Bosnia and Herzegovina, and Kosovo. |
| `ESTONIAN_PARLIAMENT` | Estonian Parliament. |
| `EU_AGENCY` | European agency. |
| `EU_AGENCY_ASYLUM` | European Union Agency for Asylum. |
| `EU_AGENCY_AVIATION_SAFETY` | European Union Aviation Safety Agency. |
| `EU_AGENCY_BEREC_SUPPORT` | Agency for Support for BEREC. |
| `EU_AGENCY_CHEMICALS` | European Chemicals Agency. |
| `EU_AGENCY_CONTROL_FISHERIES` | European Fisheries Control Agency. |
| `EU_AGENCY_CYBERSECURITY` | European Union Agency for Cybersecurity. |
| `EU_AGENCY_DECENTRALISED` | European decentralised agency. |
| `EU_AGENCY_DEFENCE` | European Defence Agency. |
| `EU_AGENCY_ENERGY_REGULATORS` | Agency for the Cooperation of Energy Regulators. |
| `EU_AGENCY_ENVIRONMENT` | European Environment Agency. |
| `EU_AGENCY_EURATOM` | European EURATOM agency. |
| `EU_AGENCY_EURATOM_SUPPLY` | Euratom Supply Agency. |
| `EU_AGENCY_EUROPOL` | European Union Agency for Law Enforcement Cooperation. |
| `EU_AGENCY_EXECUTIVE` | European executive agency. |
| `EU_AGENCY_EXECUTIVE_CINEA` | European Climate, Infrastructure and Environment Executive Agency. |
| `EU_AGENCY_EXECUTIVE_EACEA` | European Education and Culture Executive Agency. |
| `EU_AGENCY_EXECUTIVE_EISMEA` | European Innovation Council and SMEs Executive Agency. |
| `EU_AGENCY_EXECUTIVE_ERCEA` | European Research Council Executive Agency. |
| `EU_AGENCY_EXECUTIVE_HADEA` | European Health and Digital Executive Agency. |
| `EU_AGENCY_EXECUTIVE_REA` | European Research Executive Agency. |
| `EU_AGENCY_FOREIGN_SECURITY` | European common foreign and security policy agency. |
| `EU_AGENCY_FUNDAMENTAL_RIGHTS` | European Union Agency for Fundamental Rights. |
| `EU_AGENCY_FUSION_ENERGY` | Fusion for Energy Joint Undertaking. |
| `EU_AGENCY_GUARD_BORDER_COAST` | European Border and Coast Guard Agency. |
| `EU_AGENCY_JUSTICE_CRIMINAL` | Eurojust. |
| `EU_AGENCY_LAW_ENFORCEMENT_TRAINING` | European Union Agency for Law Enforcement Training. |
| `EU_AGENCY_LISA` | European Agency for the operational management of large-scale IT systems in the area of freedom, security and justice (EU-LISA). |
| `EU_AGENCY_MARITIME_SAFETY` | European Maritime Safety Agency. |
| `EU_AGENCY_MEDICINES` | European Medicines Agency. |
| `EU_AGENCY_RAILWAYS` | European Union Agency for Railways. |
| `EU_AGENCY_SAFETY_HEALTH_WORK` | European Agency for Safety and Health at Work. |
| `EU_AGENCY_SPACE_PROGRAMME` | European Union Agency for the Space Programme. |
| `EU_AUTHORITY_BANKING` | European Banking Authority. |
| `EU_AUTHORITY_FOOD_SAFETY` | European Food Safety Authority. |
| `EU_AUTHORITY_LABOUR` | European Labour Authority. |
| `EU_AUTHORITY_MARKETS_SECURITIES` | European Securities and Markets Authority. |
| `EU_AUTHORITY_PENSIONS_INSURANCE` | European Insurance and Occupational Pensions Authority. |
| `EU_AUTHORITY_POLITICAL_PARTIES_FOUNDATIONS` | Authority for European Political Parties and European Political Foundations. |
| `EU_BOARD_DATA_PROTECTION` | European Data Protection Board. |
| `EU_BODY` | European body. |
| `EU_BODY_CORPORATE` | European Union corporate body. |
| `EU_CENTRAL_BANK` | European Central Bank. |
| `EU_CENTRE_DISEASE_PREVENTION` | European Centre for Disease Prevention and Control. |
| `EU_CENTRE_DRUGS_MONITORING` | European Monitoring Centre for Drugs and Drug Addiction. |
| `EU_CENTRE_SATELLITE` | EU Satellite Centre. |
| `EU_CENTRE_TRANSLATION` | Translation Centre for the Bodies of the European Union. |
| `EU_CENTRE_VOCATIONAL_TRAINING` | European Centre for the Development of Vocational Training. |
| `EU_COMMISSION` | European Commission. |
| `EU_COMMITTEE_REGIONS` | European Union's assembly of local and regional representatives voicing sub-national authorities within the EU's intistutional framework. |
| `EU_COUNCIL` | European Council. |
| `EU_COURT_AUDITORS` | European Court of Auditors. |
| `EU_COURT_JUSTICE` | European Court of Justice. |
| `EU_DATA_PROTECTION_SUPERVISOR` | EU service ensuring that EU institutions and bodies protect personal information when processing data. |
| `EU_ECONOMIC_SOCIAL_COMMITTEE` | European advisory body issuing opinions to the other EU institutions. |
| `EU_ETHICS_BODY` | The European Union Ethics body. |
| `EU_EXTERNAL_ACTION_SERVICE` | EU's diplomatic service carrying out the EU’s foreign and security policy. |
| `EU_FOUNDATION_LIVING_WORKING_CONDITIONS` | European Foundation for the Improvement of Living and Working Conditions. |
| `EU_FOUNDATION_TRAINING` | European Training Foundation. |
| `EU_INSTITUTE_GENDER_EQUALITY` | European Institute for Gender Equality. |
| `EU_INSTITUTE_INNOVATION_TECHNOLOGY` | European Institute of Innovation and Technology. |
| `EU_INSTITUTE_SECURITY_STUDIES` | European Union Institute for Security Studies. |
| `EU_INSTITUTION` | European institution. |
| `EU_INTERINSTITUTIONAL_SERVICE` | Service administrated by the European Commission under governance of all the EU institutions. |
| `EU_INVESTMENT_BANK` | The European Investment Bank owned by the 27 member states. |
| `EU_JOINT_UNDERTAKING` | European Joint undertaking. |
| `EU_JOINT_UNDERTAKING_AVIATION_CLEAN` | Clean Aviation Joint Undertaking. |
| `EU_JOINT_UNDERTAKING_CIRCULAR_BIOBASED_EUROPE` | Circular Bio-based Europe Joint Undertaking. |
| `EU_JOINT_UNDERTAKING_EU_SINGLE_SKY_RESEARCH` | Single European Sky ATM Research 3 Joint Undertaking. |
| `EU_JOINT_UNDERTAKING_EUROPE_RAIL` | Europe’s Rail Joint Undertaking. |
| `EU_JOINT_UNDERTAKING_GLOBAL_HEALTH_EDCTP` | Global Health EDCTP Joint Undertaking. |
| `EU_JOINT_UNDERTAKING_HYDROGEN_CLEAN` | Clean Hydrogen Joint Undertaking. |
| `EU_JOINT_UNDERTAKING_INITIATIVE_INNOVATIVE_HEALTH` | Innovative Health Initiative Joint Undertaking. |
| `EU_JOINT_UNDERTAKING_KEY_DIGITAL_TECHNOLOGIES` | Key Digital Technologies Joint Undertaking. |
| `EU_JOINT_UNDERTAKING_SMART_NETWORKS_SERVICES` | Smart Networks and Services Joint Undertaking. |
| `EU_OFFICE_COMMUNITY_PLANT_VARIETY` | Community Plant Variety Office. |
| `EU_OFFICE_INTELLECTUAL_PROPERTY` | European Union Intellectual Property Office. |
| `EU_OFFICE_PROSECUTOR_PUBLIC` | European Public Prosecutor’s Office. |
| `EU_OFFICE_PUBLICATIONS` | Publications Office of the European Union. |
| `EU_OFFICE_SELECTION_PERSONNEL` | European Personnel Selection Office. |
| `EU_OMBUDSMAN` | European Ombudsman. |
| `EU_PARLIAMENT` | European Parliament. |
| `EU_POLITICAL_GROUP` | European political group. |
| `EU_POLITICAL_GROUP_ALDE` ⚠ | European political group of the Alliance of Liberals and Democrats for Europe. |
| `EU_POLITICAL_GROUP_ARC` ⚠ | Rainbow Group in the European Parliament. |
| `EU_POLITICAL_GROUP_ARE` ⚠ | European political group of the European Radical Alliance. |
| `EU_POLITICAL_GROUP_CD` ⚠ | European political group of Christian-Democrats. |
| `EU_POLITICAL_GROUP_CDI` ⚠ | European political group for the Technical Coordination and Defence of Independent Groups and Members. |
| `EU_POLITICAL_GROUP_CG` ⚠ | European political group of the Left Unity. |
| `EU_POLITICAL_GROUP_COM` ⚠ | European political group of Communists and allies. |
| `EU_POLITICAL_GROUP_DEP` ⚠ | European political group of European Progressive Democrats. |
| `EU_POLITICAL_GROUP_DR` ⚠ | European political group of the European Right. |
| `EU_POLITICAL_GROUP_ECR` | European political group of the Conservatives and Reformists. |
| `EU_POLITICAL_GROUP_ED` ⚠ | European political group of the European Democrats. |
| `EU_POLITICAL_GROUP_EDD` ⚠ | European political group for a Europe of Democracies and Diversities. |
| `EU_POLITICAL_GROUP_EDN` ⚠ | European political group Europe of Nations. |
| `EU_POLITICAL_GROUP_EFD` ⚠ | European political group Europe of freedom and democracy. |
| `EU_POLITICAL_GROUP_EFDD` ⚠ | European political group Europe of freedom and direct democracy. |
| `EU_POLITICAL_GROUP_ELDR` ⚠ | European political group of the European Liberal, Democrat and Reform Party. |
| `EU_POLITICAL_GROUP_ENF` ⚠ | European political group Europe of Nations and Freedom. |
| `EU_POLITICAL_GROUP_EPP` | European political group of the European People's Party (Christian Democrats). |
| `EU_POLITICAL_GROUP_EPP_ED` ⚠ | European political group of the European People's Party (Christian Democrats) and European Democrats. |
| `EU_POLITICAL_GROUP_ESN` | European political group Europe of Sovereign Nations. |
| `EU_POLITICAL_GROUP_FE` ⚠ | European political group Forza Europa. |
| `EU_POLITICAL_GROUP_GREEN_ALE` | European political group of the Greens/European Free Alliance. |
| `EU_POLITICAL_GROUP_GUE` ⚠ | European political group of the united left. |
| `EU_POLITICAL_GROUP_GUE_NGL` | European political group of the left. |
| `EU_POLITICAL_GROUP_ID` ⚠ | European political group Identity and Democracy. |
| `EU_POLITICAL_GROUP_IEDN` ⚠ | European political group of independants for a Europe of Nations. |
| `EU_POLITICAL_GROUP_IND_DEM` ⚠ | European political group Independence/Democracy. |
| `EU_POLITICAL_GROUP_ITS` ⚠ | European political group of the Socialists. |
| `EU_POLITICAL_GROUP_LD` ⚠ | European political group of the Liberal and Democratics. |
| `EU_POLITICAL_GROUP_LDR` ⚠ | European political group of the Liberal and Democratic Reformists. |
| `EU_POLITICAL_GROUP_NI` | Non-attached Members to a European political group. |
| `EU_POLITICAL_GROUP_PFE` | European political group Patriots for Europe. |
| `EU_POLITICAL_GROUP_PSE` ⚠ | European political group of the Socialists. |
| `EU_POLITICAL_GROUP_RDE` ⚠ | European political group of the European Democratic Alliance. |
| `EU_POLITICAL_GROUP_RENEW` | European political group Renew. |
| `EU_POLITICAL_GROUP_SD` | European political group of the Progressive Alliance of Socialists and Democrats. |
| `EU_POLITICAL_GROUP_SOC` ⚠ | European political group of the Socialists. |
| `EU_POLITICAL_GROUP_TDI` ⚠ | European political group of independent members (mixed group). |
| `EU_POLITICAL_GROUP_UEN` ⚠ | European political group Union for Europe of the Nations. |
| `EU_POLITICAL_GROUP_UPE` ⚠ | European political group of the Socialists. |
| `EU_POLITICAL_GROUP_VERTS` ⚠ | European political group of the Greens. |
| `EU_TEAM_COMPUTER_EMERGENCY` | Computer Emergency Response Team for the EU institutions, bodies and agencies. |
| `EU_UNION_COUNCIL` | Council of the European Union. |
| `EUROPEAN_UNION` | European Union |
| `FINNISH_PARLIAMENT` | Finnish Parliament. |
| `FRENCH_NATIONAL_ASSEMBLY` | French National Assembly. |
| `FRENCH_SENATE` | French Senate. |
| `GERMAN_BUNDESRAT` | German Bundesrat. |
| `GERMAN_BUNDESTAG` | German Bundestag. |
| `GOVERNING_ENTITY` | Parliamentary governing entities. |
| `GREEK_PARLIAMENT` | Greek Parliament. |
| `GROUPINGS_UNOFFICIAL` | European Parliament unofficial groupings. |
| `HUNGARIAN_PARLIAMENT` | Hungarian Parliament. |
| `INTERGROUPS` | European Parliament intergroups. |
| `IRISH_HOUSES_OIREACHTAS` | Irish Houses of the Oireachtas. |
| `ITALIAN_CHAMBER_DEPUTIES` | Italian Chamber of Deputies. |
| `ITALIAN_SENATE` | Italian Senate. |
| `JOINT_COMMITTEE_PROCEDURE_FEMM_LIBE` | Joint committee procedure - LIBE and FEMM. |
| `JOINT_UNDERTAKING_EU_HIGH_PERFORMANCE_COMPUTING` | European High-Performance Computing Joint Undertaking. |
| `LATVIAN_PARLIAMENT` | Latvian Parliament. |
| `LITHUANIAN_PARLIAMENT` | Lithuanian Parliament. |
| `LUXEMBOURG_CHAMBER_DEPUTIES` | Luxembourg Chamber of Deputies. |
| `MALTESE_PARLIAMENT` | Maltese Parliament. |
| `NATIONAL_CHAMBER` | National Chamber. |
| `NATIONAL_ENTITIES` | National entities. |
| `NATIONAL_POLITICAL_GROUP` | National political group |
| `NETHERLANDS_HOUSE_REPRESENTATIVES` | Netherlands House of Representatives. |
| `NETHERLANDS_SENATE` | Netherlands Senate. |
| `POLISH_SEJM` | Polish Sejm. |
| `POLISH_SENATE` | Polish Senate. |
| `PORTUGUESE_PARLIAMENT` | Portuguese Parliament. |
| `QUAESTORS` | European Parliament Quaestors. |
| `ROMANIAN_CHAMBER_DEPUTIES` | Romanian Chamber of Deputies. |
| `ROMANIAN_SENATE` | Romanian Senate. |
| `SHEANAD_EIREANN` | Sheanad Éireann. |
| `SLOVAK_PARLIAMENT` | Slovak Parliament. |
| `SLOVENE_NATIONAL_ASSEMBLY` | Slovene National Assembly. |
| `SLOVENE_NATIONAL_COUNCIL` | Slovene National Council. |
| `SPANISH_CONGRESS_DEPUTIES` | Spanish Congress of Deputies. |
| `SPANISH_PARLIAMENT` | Spanish Parliament. |
| `SPANISH_SENATE` | Spanish Senate. |
| `SWEDISH_PARLIAMENT` | Swedish Parliament. |
| `UNITED_KINGDOM_HOUSE_COMMONS` | United Kingdom House of Commons. |
| `UNITED_KINGDOM_HOUSE_LORDS` | United Kingdom House of Lords. |
| `WORKING_PARTIES` | European Parliament working parties. |

## ep-procedure-types

Taxonomy of the European Parliament on procedure types.

67 entries, 8 deprecated (marked ⚠).

| identifier | meaning |
|---|---|
| `AB` | Procedure nature used for funds mobilisation. |
| `AC` ⚠ | Procedure nature used for international agreements. |
| `ACI` | Procedure seeking to organise and facilitate cooperation between the EU institutions, following TFEU Art 295. |
| `AI` | Procedure nature used for Interinstitutional agreements. |
| `AN` | Procedure nature used for appointments. |
| `AP` | Procedure nature used for request for consent of the European Parliament. |
| `APP` | Procedure used for adopting most international agreements as stated in TFEU Art 289(2). |
| `AVC` ⚠ | Procedure introduced by the Single European Act used for several very important decisions, as well as for matters where the member states wish to retain a larger degree of control. |
| `BU` | Procedure nature used for budget. |
| `BUD` | Procedure used to approve the EU budget under TFEU Art 310. |
| `BUI` | Procedure used for European Parliament budgetary initiative. |
| `CN` | Procedure nature used for consultation of the Parliament. |
| `CNS` | Procedure used for politically sensitive issues under TFEU Art 289, where the member states bear responsibility for policy making and where the member states make decisions based on unanimity. |
| `CO` | Procedure nature used for codification procedures. |
| `COD` | Standard decision-making procedure defined used in the European Union, unless treaties specifically state one of the special legislative procedures is to be applied to a particular subject. |
| `COS` ⚠ | Procedure used to answer EU strategies documents proposed by European Commission. |
| `CS` | Procedure nature used for community with scrutiny procedures. |
| `DC` ⚠ | Procedure nature used for procedure with written declarations. |
| `DC` ⚠ | Procedure nature used for procedure on Commission strategy paper. |
| `DCE` ⚠ | Procedure used when the European Parliament submit a statement in the form of a written declaration. |
| `DE` | Procedure nature used for procedure on budget discharge. |
| `DEA` | Procedure used when establishing the secondary legislation to grant European Commission the mandate to establish delegated acts, but only if primary legislation allows for it and only within the boundaries set by the primary legislation. |
| `DEC` | Procedure used to approve the discharge of the EU budget under TFEU Art 319. |
| `DI` | Procedure nature used for procedure on immunity defense. |
| `ER` | Procedure nature used for procedure on the estimates of revenue and expenditure. |
| `EX` | Procedure nature used for procedure on the examination of a delegated act. |
| `GB` | Procedure nature used for procedure about transfert of appropriations. |
| `GBD` | Procedure used when European Parliament manages with budgetary agreements. |
| `IH` | Procedure nature used for other matters. |
| `IL` | Procedure nature used for procedure about some right of initiative confered on Parliament by the Treaties. |
| `IM` | Procedure nature used for assessing implementation. |
| `IMM` | Procedure used for matters relating European Parliament's Members immunity. |
| `IN` | Procedure nature used for proposing initiative. |
| `INI` | Procedure used when European Parliament uses its right for own initiative. |
| `INL` | Procedure used when European Parliament uses its right for own initiative around a legislative matter, under TFUE Art 225. |
| `INS` | Procedure used for matters related to internal procedural matters of the European Parliament. |
| `INTERINSTITUTIONAL` | Procedure involving two or more institutions. |
| `INTERNAL` | European Parliament procedures. |
| `IP` | Procedure nature used for institutional matters. |
| `IR` | Procedure nature used for European Parliament's rules of procedure interpretation matters. |
| `IS` | Procedure nature used for strategic initiative. |
| `IT` | Procedure nature used to request Commission to submit a legislative proposal. |
| `LE` | Procedure nature used for standard legislative proposal. |
| `LI` | Procedure nature used to request waiver of immunity. |
| `MC` | Procedure nature used to request motion of censure. |
| `MR` | Procedure nature used to submit a motion for non-legislative resolution on consent procedure. |
| `NATURE_PROCEDURE` | European Parliament procedures' natures. |
| `NLE` | Procedure used to adopt legal acts of general nature for which the execution details will be dealt with through secondary legislation. |
| `OR` | Procedure nature used to submit an opposition to tacit extension of delegation. |
| `PB` | Procedure nature used to prepare budget. |
| `RA` | Procedure nature used to submit annual report. |
| `RC` | Procedure nature used to submit a resolution on implementing act or power. |
| `RE` | Procedure nature used for recast procedure. |
| `REG` | Procedure used for changes related to the Rules of Procedure of the European Parliament. |
| `RG` | Procedure nature used to submit amendment(s) to the Rules of Procedure. |
| `RI` | Procedure nature used to submit an interim report. |
| `RO` | Procedure nature used to handle internal organisation of the European Parliament. |
| `RPS` ⚠ | Procedure used when establishing the secondary legislation to grant European Commission the mandate to establish implementing acts, but only if primary legislation allows for it and only within the boundaries set by the primary legislation. |
| `RQ` | Procedure nature used to submit a resolution or a debate on oral question. |
| `RS` | Procedure nature used to submit a motion on statement. |
| `RSO` | Procedure used to deal organisational matters of the European Parliament. |
| `RSP` | Procedure used to submit resolution on topics in relation with the actuality. |
| `RU` | Procedure nature used to request urgent debate or resolution. |
| `RV` | Procedure nature used to submit revocation of delegation. |
| `SC` | Procedure nature used to suspend consent procedure. |
| `SYN` ⚠ | Procedure under TFEU 252 used primarily in the field of economic and monetary policy. |
| `TE` | Procedure nature used for special committee / committee of inquiry. |

## ep-roles

Taxonomy of the European Parliament on roles.

86 entries, 1 deprecated (marked ⚠).

| identifier | meaning |
|---|---|
| `ADDRESSEE` | Entity to whom something is addressed. |
| `ADDRESSEE_ACT` | Entity to whom a formal act is addressed. |
| `ALLY` | An ally is used for members associated with a group for some common cause. |
| `AMBASSADOR` | Official working in a foreign country representing his or her own country. |
| `AUTHOR` | A person or an entity creating a document. |
| `AUTHOR_OPINION` | Entity creating an opinion. |
| `AUTHOR_REPORT` | Entity creating a report. |
| `CANDIDATE` | Candidate for a membership. |
| `CHAIR` | A chairman is someone who presides over an entity. |
| `CHAIR_BUREAU` | The Chair of the Bureau is a person who presides the bureau, entity laying down rules for the European Parliament. |
| `CHAIR_CO` | A co-chair assists the chair as needed in conducting meetings and facilitating the work of a group. |
| `CHAIR_COMMITTEE` | The chair of a parliamentary committee is the person who presides over a parliamentary committee. |
| `CHAIR_DELEGATION` | The chair of a parliamentary delegation is the person who presides over a parliamentary delegation. |
| `CHAIR_DEPUTY` | Deputy chair is a person elected to act as chair in the absence of the appointed chair. |
| `CHAIR_VICE` | A vice-chairman replaces the chair when absent. |
| `CHAIR_VICE_BUREAU` | The vice chair of the EP bureau replaces the chair and first vice chair when absent. |
| `CHAIR_VICE_BUREAU_FIRST` | The first vice chair of the EP bureau replaces the chair when absent. |
| `CHAIR_VICE_BUREAU_TREASURER` | This role has been used by political groups in the European Parliament for a person holding these two roles. |
| `CHAIR_VICE_COMMITTEE` | The committee vice-chair replaces the committee chair when absent. |
| `CHAIR_VICE_DELEGATION` | The delegation vice-chair replaces the delegation chair when absent. |
| `CHAIR_VICE_FIRST` | The first vice-chair replaces the chair when absent. |
| `COMMITTEE_BUDGETARY_ASSESSMENT` | Budgetary assessment committee gives an opinion about the budgetary measures of a procedure. |
| `COMMITTEE_LEAD` | Documents of a legislative nature are referred by the Parliament to the lead committee, also called committee responsible, for consideration. |
| `COMMITTEE_LEAD_JOINT` | Documents of a legislative nature are referred by the Parliament to the lead committee, also called committee responsible, for consideration. When matter falls on responsibility of several committees, they act jointly. |
| `COMMITTEE_OPINION` | Opinion giving parliamentary committee. |
| `COMMITTEE_OPINION_ASSOCIATED` ⚠ | Associated opinion giving committee. A such opinion has to be taken on board by the lead committee without a vote. |
| `COMMITTEE_OPINION_DA_AI` | Parliamentary committee giving an opinion on delegation of legislative powers and conferral of implementing powers in a procedure. |
| `COMMITTEE_OPINION_HUMAN_RIGHTS` | Parliamentary committee giving an opinion on human rights matters in a procedure. |
| `COMMITTEE_OPINION_LEGAL_BASIS` | Parliamentary committee giving an opinion on the legal basis in a procedure. |
| `COMMITTEE_OPINION_RECAST` | Parliamentary committee giving an opinion on the recasting technique in a procedure. |
| `HEAD_STATE` | Leader of the government in a country. |
| `INSTITUTION_LEAD` | Institution responsible for a given activity within the inter-institutional procedure. |
| `MEMBER` | Appointed member of an entity. |
| `MEMBER_BUREAU` | Member of the Bureau of the European Parliament. |
| `MEMBER_BUREAU_ENLARGED` | Member of the enlarged Bureau of the European Parliament, person appointed to include representatives of candidate states. |
| `MEMBER_COMMISSION` | Member of the European Commission. |
| `MEMBER_COMMITTEE_PARLIAMENTARY` | Member of a parliamentary committee. |
| `MEMBER_DELEGATION_OFFICIAL` | Member participating in an official delegation. |
| `MEMBER_DELEGATION_PARLIAMENTARY` | Member of a parliamentary delegation. |
| `MEMBER_NEGOTIATION_INTERINSTITUTIONAL` | Member taking part in an interinstitutional negotiation. |
| `MEMBER_PARLIAMENT` | Elected member of the European Parliament. |
| `MEMBER_SUBSTITUTE` | Substitute member alternates with another member. |
| `MINISTER` | Member of the government who is in charge of a particular department or policy area. |
| `OBSERVER` | This title is used in the European Parliament where pending the entry into force of the accession treaty, an observer of the candidate country participates in the work of the European Parliament and is entitled to speak in the committees and in the political groups. |
| `OBSERVER_SUBSTITUTE` | A substitute observer is an observer who alternates with the regular observer in the European Parliament. |
| `OMBUDSMAN` | The European Ombudsman investigates complaints about maladministration in the institutions and bodies of the European Union. The Ombudsman is completely independent and impartial. |
| `PRESIDENT` | A president is a person who presides over a meeting, assembly or a group. |
| `PRESIDENT_ACTING` | An acting president is acting as president in case of absence of the president. |
| `PRESIDENT_CENTRAL_BANK` | President of the European Central Bank. |
| `PRESIDENT_CO` | A co-president assists the president as needed in conducting meetings and facilitating the work of an assembly, for example of a joint parliamentary assembly. |
| `PRESIDENT_COMMISSION` | President of the European Commission. |
| `PRESIDENT_COMMISSION_VICE` | Vice-presidents of the European Commission act for the president when absent. |
| `PRESIDENT_COMMITTEE_ECONOMIC_SOCIAL` | President of the economic and social committee. |
| `PRESIDENT_COMMITTEE_REGIONS` | President of the committee of the regions. |
| `PRESIDENT_COUNCIL` | President of the Council of the European Union. |
| `PRESIDENT_COUNCIL_EUROPEAN` | Person who moderates debates, makes rulings on procedure, etc. |
| `PRESIDENT_COURT_AUDITORS` | President of the European Court of Auditors. |
| `PRESIDENT_COURT_JUSTICE` | President of the European Court of Justice. |
| `PRESIDENT_PARLIAMENT` | The President of the European Parliament presides over the debates and activities of the European Parliament and represents the Parliament within the EU and internationally. |
| `PRESIDENT_PARLIAMENT_STOA` | European Parliament vice-president responsible for STOA. |
| `PRESIDENT_PARLIAMENT_VICE` | Vice-presidents of the European Parliament chair debates when the president is not in the chamber. |
| `PRESIDENT_VICE` | A vice-president is someone who replaces the president when absent. |
| `PRESIDENT_VICE_FIRST` | A first vice-president takes on the main role in the absence of a president. |
| `PRESIDENT_VICE_SECOND` | A second vice-president takes on the main role of a president in the absence of the president and the first vice-president. |
| `QUAESTOR` | Quaestor is a person responsible for administrative and financial matters directly concerning Members. |
| `RAPPORTEUR` | A person who reports. |
| `RAPPORTEUR_CHAIR` | A person who reports in the name of being the chair of the committee. |
| `RAPPORTEUR_CHAIR_OPINION` | A person who submits an opinion in the name of being the chair of the committee. |
| `RAPPORTEUR_CO` | A person who reports in case of multiple rapporteurs on a same dossier. |
| `RAPPORTEUR_OPINION` | A person who prepares a report for opinion. |
| `RAPPORTEUR_SHADOW` | A shadow rapporteur is a MEP who monitors the legislative process and finds compromise with the work of the rapporteur on behalf of a political group. |
| `RAPPORTEUR_SHADOW_OPINION` | A shadow rapporteur is a MEP who monitors the legislative process and finds compromise with the work of the rapporteur on behalf of a political group to elaborate an opinion. |
| `RAPPORTEUR_SHADOW_REPORT` | A shadow rapporteur is a MEP who monitors the legislative process and finds compromise with the work of the rapporteur on behalf of a political group to elaborate a report. |
| `REPRESENT` | Someone who speaks or does something officially for another person or group of people. |
| `REPRESENT_DIPLOMAT` | Someone who officially represents a country in another country. |
| `REPRESENT_HIGH` | The High Representative is charged with coordinating and carrying out the EU's foreign and security policy. |
| `REPRESENT_PERMANENT` | National officials from member states who act as their country's ambassador to the European Union. |
| `REPRESENT_STATE` | National officials from the governments of member states that ensure that the interests and policies of their state are effectively pursued by the European Union. |
| `SECRETARY_BUREAU` | Secretary of the Bureau is appointed to maintain records and deals with administrative tasks for the Bureau of the European Parliament. |
| `SECRETARY_GENERAL` | Head of a general organisation. |
| `SIGNATORY` | A person who signs a document. |
| `SPEAKER` | A person who speaks. |
| `SPEAKER_PARLIAMENT` | A person belonging to the European Parliament who speaks. |
| `TREASURER` | A treasurer manages the finances of an entity. |
| `TREASURER_CO` | A co-treasurer assists the treasurer in managing the finances of an entity. |
| `TREASURER_DEPUTY` | A deputy treasurer manages the finances of a group in the absence of the appointed treasurer. |

## ep-statuses

Taxonomy of the European Parliament on statuses.

24 entries.

| identifier | meaning |
|---|---|
| `ACCEPTED` | Something agreed or approved. |
| `ACCEPTED_PARTLY` | Something partially agreed or approved. |
| `ACTIVE` | Something under proceedings. |
| `ACTIVE_PROC` | Procedure under proceedings. |
| `ADOPTED` | Something agreed, voted, successfully concluded. |
| `ADOPTED_PARTLY` | Something that is partially agreed or positively voted. |
| `CANCELLED` | Something stopped that has already been arranged from happening; a statement that something will not happen. |
| `COMPLETED` | Something brought to an end, successfully concluded. |
| `COMPLETED_PROC` | Procedure brought to an end, successfully concluded. |
| `DEADLINE` | A point in time by which something must be done. |
| `DEPRECATED` | Someting no longer used, historised, archived. |
| `FINAL` | Something standing in a stable version. |
| `LAPSED` | Something no longer valid, expired. |
| `OCCURRED` | Something happened, past. |
| `PENDING` | Something awaiting decision. |
| `POSTPONED` | Something arranged to take place at a time later than initially scheduled. |
| `PROVISIONAL` | Something standing in a non definitve version. |
| `REJECTED` | Something being refused. |
| `REVISED` | Something that has been reviewed. |
| `SCHEDULED` | Something arranged to happen at a particular time. |
| `SUBMITTED` | Something being proposed for examination. |
| `WITHDRAWN` | Something being discarded. |
| `WITHDRAWN_PARTLY` | Something being partly discarded. |
| `WITHDRAWN_PROC` | Procedure discarded. |

---

Generated from the API's own concept schemes; `openapi/status.js` and the import
scripts read them only through `work-type` / `had_activity_type` / `decision_method`,
so a renamed or added entry shows up as an unmatched value in those columns.
