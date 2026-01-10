
import { Ability } from "@casl/ability";

import { getMetadataArgsStorage } from "typeorm";
import { Action } from "../entities/permission.entity";
// Charger toutes les entités enregistrées dans TypeORM
const allEntities = getMetadataArgsStorage().tables.map((table) => table.target);

// Construire dynamiquement les types des sujets
type Subjects = typeof allEntities[number] | 'all';

// AppAbility définit la structure des permissions
export type AppAbility = Ability<[Action, Subjects]>;

export type PolicyHandler = (ability: AppAbility) => boolean;
