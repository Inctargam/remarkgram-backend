export class User {
    props;
    constructor(props) {
        this.props = props;
    }
    static restore(props) {
        return new User(props);
    }
    get id() {
        return this.props.id;
    }
    get email() {
        return this.props.email;
    }
    get name() {
        return this.props.name;
    }
}
//# sourceMappingURL=user.entity.js.map