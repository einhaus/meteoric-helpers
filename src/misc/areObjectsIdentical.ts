export const areObjectsIdentical = <T extends object>(obj1: T, obj2: T): boolean => {
    const obj1Props = Object.getOwnPropertyNames(obj1);
    const obj2Props = Object.getOwnPropertyNames(obj2);

    if (obj1Props.length !== obj2Props.length) return false;

    for (const propName of obj1Props) {
        if (!Object.prototype.hasOwnProperty.call(obj2, propName)) return false;

        const propValue1 = obj1[propName as keyof T];
        const propValue2 = obj2[propName as keyof T];

        if (propValue1 !== propValue2) return false;
    }

    return true;
};
