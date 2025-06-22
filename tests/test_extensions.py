from flask import Flask
from flask_bcrypt import Bcrypt
from flask_login import LoginManager
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

import timber.extensions as ext


def test_singleton_instances():
    # Each global should be a single instance of its extension class
    assert isinstance(ext.db, SQLAlchemy)
    assert isinstance(ext.migrate, Migrate)
    assert isinstance(ext.login_manager, LoginManager)
    assert isinstance(ext.bcrypt, Bcrypt)


def test_db_init_app_registers_sqlalchemy_extension():
    app = Flask(__name__)
    # SQLAlchemy needs a URI to avoid raising
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    ext.db.init_app(app)
    # After init_app, the 'sqlalchemy' key should appear
    assert "sqlalchemy" in app.extensions
    # The session should at least support execute/connection
    sess = ext.db.session
    assert hasattr(sess, "execute")


def test_migrate_init_app_registers_migrate_extension():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    # Need to init db first
    ext.db.init_app(app)
    ext.migrate.init_app(app, ext.db)
    assert "migrate" in app.extensions


def test_login_manager_init_app_attaches_manager():
    app = Flask(__name__)
    ext.login_manager.init_app(app)
    # Flask-Login attaches itself to the app object
    assert hasattr(app, "login_manager")
    assert app.login_manager is ext.login_manager


def test_bcrypt_hash_and_verify():
    app = Flask(__name__)
    ext.bcrypt.init_app(app)
    pw = "supersecret"
    hashed = ext.bcrypt.generate_password_hash(pw)
    # Should produce a hash (bytes or str depending on version)
    assert isinstance(hashed, (bytes, str))
    # And correctly verify
    assert ext.bcrypt.check_password_hash(hashed, pw)
    assert not ext.bcrypt.check_password_hash(hashed, pw + "x")
