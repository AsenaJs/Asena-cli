/**
 * Component metadata constants
 * These must match the values used by @asenajs/asena framework
 */
export class ComponentConstants {

  /**
   * IOC Object Key - Symbol used to mark classes as IOC components
   * This is the primary key used to identify components during scanning
   */
  public static readonly IOCObjectKey = Symbol('ioc:object');

}

// Legacy constant for backward compatibility (deprecated)
/** @deprecated Use ComponentConstants.IOCObjectKey instead */
export const IOC_OBJECT_KEY = '_IIocObject';
