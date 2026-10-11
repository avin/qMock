import { Popover } from "@base-ui/react/popover";
import type { MockOverrideParamInfo } from "@catalog";
import cog6ToothImgSrc from "./images/cog-6-tooth.svg";
import styles from "./MockOverrideParams.module.scss";

interface Props {
  overrideName: string;
  params: MockOverrideParamInfo[];
  values: Record<string, boolean | string>;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onChange: (values: Record<string, boolean | string>) => void;
}

export function MockOverrideParams({
  overrideName,
  params,
  values,
  isOpen,
  onOpenChange,
  onChange,
}: Props) {
  if (params.length === 0) {
    return null;
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={onOpenChange}>
      <Popover.Trigger
        className={styles.trigger}
        aria-label={`Settings for ${overrideName}`}
        type="button"
      >
        <img src={cog6ToothImgSrc} alt="" width={16} height={16} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="right" align="start" sideOffset={8} className={styles.positioner}>
          <Popover.Popup className={styles.popup}>
            <Popover.Title className={styles.title}>Settings</Popover.Title>
            <div className={styles.fields}>
              {params.map((param) => {
                const fieldId = `mock-override-param-${overrideName}-${param.key}`;

                if (param.type === "boolean") {
                  return (
                    <label key={param.key} className={styles.booleanField} htmlFor={fieldId}>
                      <input
                        id={fieldId}
                        className={styles.checkbox}
                        type="checkbox"
                        checked={values[param.key] === true}
                        onChange={(event) =>
                          onChange({ ...values, [param.key]: event.target.checked })
                        }
                      />
                      <span>{param.key}</span>
                    </label>
                  );
                }

                if (param.options !== undefined && param.options.length > 0) {
                  return (
                    <label key={param.key} className={styles.field} htmlFor={fieldId}>
                      <span>{param.key}</span>
                      <select
                        id={fieldId}
                        className={styles.control}
                        value={String(values[param.key] ?? param.default)}
                        onChange={(event) =>
                          onChange({ ...values, [param.key]: event.target.value })
                        }
                      >
                        {param.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }

                return (
                  <label key={param.key} className={styles.field} htmlFor={fieldId}>
                    <span>{param.key}</span>
                    <input
                      id={fieldId}
                      className={styles.control}
                      type="text"
                      value={String(values[param.key] ?? param.default)}
                      onChange={(event) => onChange({ ...values, [param.key]: event.target.value })}
                    />
                  </label>
                );
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
