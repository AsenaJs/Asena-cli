import type { DevtoolsComponentType, DevtoolsSnapshot, DevtoolsValueField } from '../../lib/console/protocol';

export interface ValueRow extends DevtoolsValueField {
  component: string;
  componentType: DevtoolsComponentType;
  /** The key reads like a credential, so the variable's value deserves care wherever it is set. */
  secret: boolean;
}

const SECRET_KEY =
  /SECRET|PASSW(OR)?D|PASSPHRASE|TOKEN|API_?KEY|ACCESS_?KEY|PRIVATE|CREDENTIAL|AUTH|SALT|SIGNING|(^|_)DSN$|DATABASE_URL|CONNECTION_STRING/i;

export const isSecretKey = (key: string): boolean => SECRET_KEY.test(key);

export const valueRows = (snapshot: DevtoolsSnapshot): ValueRow[] =>
  snapshot.components.flatMap((component) =>
    component.values.map((value) => ({
      ...value,
      component: component.name,
      componentType: component.type,
      secret: isSecretKey(value.key),
    })),
  );

/** `missing`: unset with no default, which makes the container throw when it builds the component. */
export type ValueState = 'set' | 'default' | 'missing';

export const valueState = (value: Pick<DevtoolsValueField, 'isSet' | 'hasDefault'>): ValueState => {
  if (value.isSet) return 'set';

  return value.hasDefault ? 'default' : 'missing';
};
